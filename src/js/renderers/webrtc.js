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
        const peerConnection = new RTCPeerConnection();
        window[`__ready__${settings.id}`](peerConnection);
        return peerConnection;
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
            path: 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/2.0.4/socket.io.js'
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

        const id = mediaElement.id + '_' + options.prefix;
        let isActive = false;

        let node = null,
            socket = null,
            peerConnection = null;

        if (mediaElement.originalNode === undefined || mediaElement.originalNode === null) {
            node = document.createElement('video');
            mediaElement.appendChild(node);
        } else {
            node = mediaElement.originalNode;
        }

        node.setAttribute('id', id);
        node.autoplay = true;

        const addLocalStream = (peerConnection) => {
                navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: true
                })
                    .then(gotStream)
                    .catch(function(e) {
                        console.error('getUserMedia() error: ' + e.name);
                    });
                function gotStream(stream) {
                    stream.getTracks().forEach(
                        function(track) {
                            peerConnection.addTrack(
                                track,
                                stream
                            );
                        }
                    );
                }
            },
            onTrack = (peerConnection) => {
                peerConnection.ontrack = (e) => {
                    if (node.srcObject !== e.streams[0]) {
                        node.srcObject = e.streams[0];
                        console.info('received remote stream');
                    }
                };
            },
            onIceCandidate = (peerConnection) => {
                peerConnection.onicecandidate = function (event) {
                    if (event.candidate) {
                        socket.emit('sdp', event.candidate);
                    }

                };
            },
            onIceConnectionStateChange = (peerConnection) => {
                if(peerConnection) {
                    console.info('ICE state: ' + peerConnection.iceConnectionState);
                }
            };

        function  onSocketMessage(msgObj) {
            let topic, data;

            topic = msgObj.topic;
            data = msgObj.data;

            if(topic === 'sdp' && data !== undefined) {
                switch(data.type) {
                    case "offer":
                        handleOffer(data);
                        break;
                    case "answer":
                        handleAnswer(data);
                        break;
                    default:
                        break;
                }
                if(data.candidate) {
                    handleCandidate(data);
                }
            }
        }

        function handleOffer(offer) {
            peerConnection.setRemoteDescription(offer).then(
                () => {
                    peerConnection.createAnswer().then(
                        onCreateAnswerSuccess,
                        () => {
                            console.info('Failed to create session description: ' + error.toString());
                        }
                    );
                },
                error => {
                    console.error('Failed to set session description: ' + error.toString());
                }
            );

            function onCreateAnswerSuccess(answer) {
                peerConnection.setLocalDescription(answer);
                socket.emit('sdp', answer);
            }
        }
        
        function handleAnswer(answer) {
            peerConnection.setRemoteDescription(answer);
        }
        
        function handleCandidate(candidate) {
            peerConnection.addIceCandidate(candidate).catch(e => console.error(e));
        }

        const onConnect = () => {
                console.info('=========on socket connected==========');

                //subscribe sdp
                socket.on('sdp', (data) => {
                    onSocketMessage({
                        topic: 'sdp',
                        data: data
                    });
                });

            };

        function handUp() {
            if(mediaElement.peerConnection) {
                mediaElement.peerConnection.close();
                mediaElement.peerConnection = null;
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
                                peerConnection = WebRTC._createPlayer({
                                    options: options,
                                    id: id
                                });

                                addLocalStream(peerConnection);
                                onTrack(peerConnection);
                                onIceCandidate(peerConnection);
                                onIceConnectionStateChange(peerConnection);
                            }
                            if(socket !== null) {
                                socket.close();
                                socket = io(value);
                                socket.on('connect', onConnect);
                                socket.on('disconnect', () => {
                                    socket.open();
                                });
                                socket.on('reconnect_failed', () => {
                                    handUp();
                                    throw Error('reconnect_failed');
                                });
                                socket.on('connect_timeout', () => {
                                    socket.open();
                                });
                                socket.on('connect_error', (error ) => {
                                    handUp();
                                    throw error;
                                });
                            }
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

        window['__ready__' + id] = (_peerConnection) => {
            mediaElement.peerConnection = peerConnection = _peerConnection;
            addLocalStream(peerConnection);
            onTrack(peerConnection);
            onIceCandidate(peerConnection);
            onIceConnectionStateChange(peerConnection);

            mediaElement.socket = socket = io(mediaFiles[0].src);
            socket.on('connect', onConnect);
            socket.on('disconnect', () => {
                socket.open();
            });
            socket.on('reconnect_failed', () => {
                handUp();
                throw Error('reconnect_failed');
            });
            socket.on('connect_timeout', () => {
                socket.open();
            });
            socket.on('connect_error', (error ) => {
                handUp();
                throw error;
            });

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
            if (peerConnection !== null) {
                peerConnection.close();
            }
            if(socket !== null) {
                socket.close();
            }
        };

        node.createOffer = (offerOptions) => {
            peerConnection.createOffer(
                offerOptions
            ).then(
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
