const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('Có một người chơi vừa kết nối vào phòng!');

    socket.on('gui_tin_nhan_mau', (data) => {
        console.log('Server nhận được tin nhắn mẫu: ' + data);
        io.emit('tin_nhan_moi_tu_server', data);
    });

    socket.on('disconnect', () => {
        console.log('Một người chơi đã thoát.');
    });
});

// THAY ĐỔI Ở ĐÂY: Tự động lấy cổng (PORT) của Render khi đưa lên mạng
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server multiplayer đang chạy tại cổng: ${PORT}`);
});
