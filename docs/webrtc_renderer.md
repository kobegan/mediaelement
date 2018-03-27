# Usage
* [Start signalling server](#server)
* [Start clients](#client)

<a id="server"></a>
## Start signalling server
在使用webrtc renderer之前，需要先启动webrtc信令服务器，文件为test/webrtc_renderer/socket.io_server.js.
该信令服务器为一个简单的SDP信令转发服务器，主要功能是创建一个可以供两个webrtc 端点交换SDP信息的channel。channel名字可以由用户指定，默认为livestream。

启动server:
node test/webrtc_renderer/socket.io_server.js --channel=webrtc_test_channel

<a id="client"></a>
## Start client

## Initialize player
```html
<script>
	// You can use either a string for the player ID (i.e., `player`), 
	// or `document.querySelector()` for any selector
	
	// 这里的channel为启动webrtc信令服务器时指定的channel名称，详细请看上面部分文档
	let channel = 'webrtc_test_channel';
	
	var player = new MediaElement('player', {
		pluginPath: "/path/to/shims/",
		success: function(mediaElement, originalNode) {
			// do things
			mediaElement.setSrc(`http://localhost:3030/${channel}.webrtc`);
		}
	});
</script>
```
其中，setSrc的参数为带有channel参数的socket.io server地址，在例子中，channel为webrtc_test_channel，该server地址为http://localhost:3030/webrtc_test_channel.webrtc。
在MediaElement中，根据media type来选择renderer，为了在MediaElement使用webrtc renderer，在src中使用了以webrtc为后缀名的socket.io server address。
## Open clients
默认地，同一个channel，webrtc renderer测试例子只支持两个clients同时在线视频对话，在浏览器中打开两次test/webrtc_renderer/webrtc.html，连接至同一个channel，完成后，任意一端点击页面上的CreateOffer即可开启视频对话。

