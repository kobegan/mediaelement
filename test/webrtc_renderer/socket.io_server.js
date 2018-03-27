/**
 * Created by Ganchao on 2018/3/26.
 */
const app = require('http').createServer();
const io = require('socket.io')(app);

let channel = 'livestream';

let arguments = process.argv.splice(2);

if(arguments[0]) {
    channel = arguments[0].substr(arguments[0].indexOf('=') + 1);
}

app.listen(3030, () => {
    console.log('socket.io server listening on port 3030');
});

io.of(`${channel}.webrtc`).on('connection', function(socket) {
    socket.join(`${channel}`, () => {
        console.info(`Join room ${channel}`);
    });

    socket.on('sdp', function (data) {
        //send it to other clients in this room
        socket.to(`${channel}`).emit('sdp', data);
    });

    socket.on('disconnect', (reason) => {
        console.info('socket disconnected：' + reason);
    });
});