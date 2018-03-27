/**
 * Created by Ganchao on 2018/3/26.
 */

const app = require('http').createServer();
const io = require('socket.io')(app);

app.listen(3030, () => {
    console.log('socket.io server listening on port 3030');
});

io.of('livestream.webrtc').on('connection', function(socket) {
    socket.join('livestream', () => {
        console.info('Join room livestream');
    });

    socket.on('sdp', function (data) {
        //send it to other clients in this room
        socket.to('livestream').emit('sdp', data);
    });

    socket.on('disconnect', (reason) => {
        console.info('socket disconnected：' + reason);
    });
});