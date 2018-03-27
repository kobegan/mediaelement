# Usage
* [Start socket.io server](#server)
* [Start webrtc client](#client)

<a id="server"></a>
## Start socket.io server
在使用webrtc render之前，需要先启动webrtc信令服务器，即socket.io server，文件为test/webrtc_renderer/socket.io_server.js.
该信令服务器为一个简单的SDP信令转发服务器，主要功能有三个：
1. 创建一个namespace为livestream.webrtc的socket.io server.
2. 加入该server的socket默认地将被加入到livestream房间.
3. 收到client的SDP消息后，转发至livestream房间内其它socket.

启动server:
node test/webrtc_renderer/socket.io_server.js

<a id="client"></a>
## Start webrtc client

## Initialize player
```html
<script>
	// You can use either a string for the player ID (i.e., `player`), 
	// or `document.querySelector()` for any selector
	var player = new MediaElement('player', {
		pluginPath: "/path/to/shims/",
		success: function(mediaElement, originalNode) {
			// do things
			mediaElement.setSrc('http://localhost:3030/livestream.webrtc');
		}
	});
</script>
```
其中，setSrc的参数为带有namespace的socket.io server地址，在例子中，该地址为http://localhost:3030/livestream.webrtc，http://localhost:3030为server地址，livestream.webrtc为server的namespace。
在MediaElement中，根据media type来选择render，为了在MediaElement使用webrtc render，在src中使用了以webrtc为后缀名的socket.io address。
## Open clients
目前为止，webrtc render测试例子只支持两个clients同时在线视频对话，在浏览器中打开两次test/webrtc_renderer/webrtc.html，完成后，任意一端点击页面上的CreateOffer即可开启视频对话。

