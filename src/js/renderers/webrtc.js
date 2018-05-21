/**
 * Created by Ganchao on 2018/3/22.
 */

'use strict';

// import window from 'global/window';
// import document from 'global/document';
import mejs from '../core/mejs';
import {renderer} from '../core/renderer';
import {createEvent} from '../utils/general';
import {loadScript} from '../utils/dom';

/**
 * WebRTC renderer
 *
 * Uses webrtc adapter for browser compatibility issues.
 * @see https://webrtc.github.io/adapter/adapter-latest.js
 * Uses socket.io to interchange messages between peer connections.
 * @see https://socket.io/
 *
 */

const WebRTC = {
    promises: [],

    /**
     * Create a queue to prepare the loading of webrtc adapter and socket.io sources
     *
     * @param {Object} settings - an object with settings needed to load webrtc adapter and socket.io instance
     */
    load: (settings) => {
        if (typeof io === 'undefined') {
            settings.options.adapter.path = typeof settings.options.adapter.path === 'string' ?
                settings.options.adapter.path : 'https://webrtc.github.io/adapter/adapter-latest.js';
            settings.options.socket_io.path = typeof settings.options.socket_io.path === 'string' ?
                settings.options.socket_io.path : 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.1.0/socket.io.js';

            let socketioLoaderPromise = loadScript(settings.options.socket_io.path);
            socketioLoaderPromise.then(() => {
                WebRTC._createPlayer(settings);
            });

            WebRTC.promises.push(socketioLoaderPromise);
            WebRTC.promises.push(loadScript(settings.options.adapter.path));

            return WebRTC.promises;
        } else {
            Promise.all(WebRTC.promises).then(() => {
                WebRTC._createPlayer(settings);
            })
        }
    },

    /**
     * Create a new instance of RTCPeerConnection and trigger a custom event to initialize it
     *
     * @param {Object} settings - an object with settings needed to instantiate RTCPeerConnection object
     */
    _createPlayer: (settings) => {
        window[`__ready__${settings.id}`]();
        return;
    }
};

const WebRTCRender = {
    name: 'webrtc',
    options: {
        prefix: 'webrtc',
        adapter: {
            path: 'https://webrtc.github.io/adapter/adapter-latest.js'
        },
        socket_io: {
            path: 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.1.0/socket.io.js'
        }
    },

    /**
     * Determine if a specific element type can be played with this render
     *
     * @param {String} type
     * @return {Boolean}
     */
    canPlayType: (type) => {

        if ((~['video/webrtc'].indexOf(type.toLowerCase()))) {
            return 'yes';
        } else {
            return '';
        }
    },

    /**
     * Create the player instance and add all native events/methods/properties as possible
     *
     * @param {MediaElement} mediaElement Instance of mejs.MediaElement already created
     * @param {Object} options All the player configuration options passed through constructor
     * @param {Object[]} mediaFiles List of sources with format: {src: url, type: x/y-z}
     * @return {Object}
     */
    create: (mediaElement, options, mediaFiles) => {
        console.dir(options);
        const id = mediaElement.id + '_' + options.prefix;
        let isActive = false;

        let node = null,
            socket = null,
            peerConnection = null,
            local_stream_promise;

        if (mediaElement.originalNode === undefined || mediaElement.originalNode === null) {
            node = document.createElement('video');
            mediaElement.appendChild(node);
        } else {
            node = mediaElement.originalNode;
        }

        node.setAttribute('id', id);
        node.autoplay = true;

        function setStatus(text) {
            console.info(text);
        }

        function setError(text) {
            console.error(text);
        }

        function getLocalStream() {
            // Add local stream
            if(!options.mediaToSend || (options.mediaToSend.audio === 'false' && options.mediaToSend.video === 'false')) {
                setStatus('media to send none!');
                return Promise.resolve();
            }

            if (navigator.mediaDevices.getUserMedia) {
                return navigator.mediaDevices.getUserMedia({
                    audio: options.mediaToSend.audio === 'true',
                    video: options.mediaToSend.video === 'true'
                });
            } else {
                return Promise.resolve();
            }
        }

        function onIncomingOffer(sdp) {
            peerConnection.setRemoteDescription(sdp).then(() => {
                setStatus("Remote SDP set");
                if (sdp.type !== "offer")
                    return;
                setStatus("Got SDP offer");
                local_stream_promise.then(() => {
                    setStatus("Got local stream, creating answer");
                    peerConnection.createAnswer()
                        .then(onLocalDescription).catch(setError);
                }).catch(setError);
            }).catch(setError);
        }

        function onLocalDescription(desc) {
            setStatus("Got local description: " + JSON.stringify(desc));
            peerConnection.setLocalDescription(desc).then(() => {
                setStatus("Sending SDP answer");
                socket.emit('sdp', desc);
            });
        }

        function onRemoteStreamAdded(event) {
            let videoTracks = event.stream.getVideoTracks();
            let audioTracks = event.stream.getAudioTracks();

            if (videoTracks.length > 0) {
                console.log('Incoming stream: ' + videoTracks.length + ' video tracks and ' + audioTracks.length + ' audio tracks');
                node.srcObject = event.stream;

                node.addEventListener('loadstart', () => {
                    setStatus((new Date()).toLocaleTimeString());
                    setStatus('load start: ' + new Date());
                });

                node.addEventListener('loadedmetadata', () => {
                    setStatus((new Date()).toLocaleTimeString());
                    setStatus('loadedmetadata: ' + new Date());
                });
            } else {
                setStatus('Stream with unknown tracks added, resetting');
            }
        }

        function onIncomingICE(ice) {
            setStatus("Got ice description: " + JSON.stringify(ice));
            let candidate = new RTCIceCandidate(ice);
            peerConnection.addIceCandidate(candidate).catch(setError);
        }

        function createPeerConnection() {
            if(peerConnection) {
                return;
            }
            // Reset connection attempts because we connected successfully

            setStatus('Creating RTCPeerConnection');

            peerConnection = new RTCPeerConnection();
            peerConnection.onaddstream = onRemoteStreamAdded;
            /* Send our video/audio to the other peer */
            local_stream_promise = getLocalStream().then((stream) => {
                setStatus('Adding local stream');
                if(stream) {
                    peerConnection.addStream(stream);
                }
                return stream;
            }).catch(setError);

            peerConnection.onicecandidate = (event) => {
                // We have a candidate, send it to the remote party with the
                // same uuid
                if (event.candidate === null) {
                    setStatus("ICE Candidate was null, done");
                    return;
                }
                setStatus('Sending candidate: ' + JSON.stringify(event.candidate));
                socket.emit('sdp', event.candidate);
            };

            setStatus("Created peer connection for call, waiting for SDP");
        }

        function  onSdpMessage(msgObj) {
            let topic, data;

            topic = msgObj.topic;
            data = msgObj.data;

            if(topic === 'sdp' && data !== undefined) {
                switch(data.type) {
                    case "offer":
                        onIncomingOffer(data);
                        break;
                    case "answer":
                        onIncomingAnswer(data);
                        break;
                    default:
                        break;
                }
                if(data.candidate) {
                    onIncomingICE(data);
                }
            }
        }
        
        function onIncomingAnswer(answer) {
            peerConnection.setRemoteDescription(answer).catch(setError);
        }

        const onConnect = () => {
                console.info('=========on socket connected==========');
                //subscribe sdp
                socket.on('sdp', (data) => {
                    onSdpMessage({
                        topic: 'sdp',
                        data: data
                    });
                });

                socket.on('connected', () => {
                    console.info('on session connected!');
                    if(options.caller === 'true') {
                        local_stream_promise.then(() => {
                            setStatus("Got local stream, creating offer");
                            node.createOffer();
                        }).catch(setError);
                    }
                });

            };

        function handUp() {
            if(mediaElement.peerConnection) {
                mediaElement.peerConnection.close();
                mediaElement.peerConnection = null;
            }

            if(socket) {
                socket.close();
                socket = null;
            }
        }

        function socketInit(socket) {
            if(socket) {
                socket.on('connect', onConnect);
                socket.on('disconnect', () => {
                    handUp();
                });
                socket.on('reconnect_failed', () => {
                    handUp();
                });
                socket.on('connect_timeout', () => {
                    socket.open();
                });
                socket.on('connect_error', (error ) => {
                    handUp();
                    setStatus(error.message);
                });
            }
        }

        const
            props = mejs.html5media.properties,
            assignGettersSetters = (propName) => {
                const capName = `${propName.substring(0, 1).toUpperCase()}${propName.substring(1)}`;

                node[`get${capName}`] = () => node[propName];

                node[`set${capName}`] = (value) => {
                    if (mejs.html5media.readOnlyProperties.indexOf(propName) === -1) {
                        if (propName === 'src') {
                            node[propName] = typeof value === 'object' && value.src ? value.src : value;
                            if (peerConnection !== null) {
                                peerConnection.close();
                                peerConnection = null;
                            }

                            createPeerConnection();

                            if(socket !== null) {
                                socket.close();
                                socket = null;
                            }

                            socket = io(value, { forceNew: true });
                            socketInit(socket);
                        } else {
                            node[propName] = value;
                        }
                    }
                };
            }
        ;

        for (let i = 0, total = props.length; i < total; i++) {
            assignGettersSetters(props[i]);
        }

        window['__ready__' + id] = () => {
            createPeerConnection();
            mediaElement.peerConnection = peerConnection;

            mediaElement.socket = socket = io(mediaFiles[0].src, { forceNew: true });
            socketInit(socket);
        };

        const
            events = mejs.html5media.events.concat(['click', 'mouseover', 'mouseout']).filter(e => e !== 'error'),
            assignEvents = (eventName) => {
                node.addEventListener(eventName, (e) => {
                    // Emmit an event only in case of the renderer is active at the moment
                    if (isActive) {
                        const event = createEvent(e.type, e.target);
                        mediaElement.dispatchEvent(event);
                    }
                });

            }
        ;

        for (let i = 0, total = events.length; i < total; i++) {
            assignEvents(events[i]);
        }

        // HELPER METHODS
        node.setSize = (width, height) => {
            node.style.width = `${width}px`;
            node.style.height = `${height}px`;
            return node;
        };

        node.hide = () => {
            isActive = false;
            node.style.display = 'none';

            return node;
        };

        node.show = () => {
            isActive = true;
            node.style.display = '';

            return node;
        };

        node.destroy = () => {
            console.trace('render destroy!');
            if (peerConnection !== null) {
                peerConnection.close();
            }
            if(socket !== null) {
                socket.close();
            }
        };

        node.createOffer = () => {
            setStatus('create offer');
            peerConnection.createOffer({
                offerToReveiveVideo: options.mediaToReveive ? options.mediaToReveive.video === 'true' : false,
                offerToReveiveAudio: options.mediaToReveive ? options.mediaToReveive.audio === 'true' : false
            }).then(
                onCreateOfferSuccess,
                error => {
                    console.error('Failed to create session description: ' + error.toString());
                }
            );

            function onCreateOfferSuccess(desc) {
                peerConnection.setLocalDescription(desc).then(
                    function() {
                        socket.emit('sdp', desc);
                    },
                    error => {
                        console.error('Failed to set session description: ' + error.toString());
                    }
                );
            }
        };

        const event = createEvent('rendererready', node);
        mediaElement.dispatchEvent(event);

        mediaElement.promises.push(WebRTC.load({
            options: options,
            id: id
        }));

        return node;
    }
};

renderer.add(WebRTCRender);
