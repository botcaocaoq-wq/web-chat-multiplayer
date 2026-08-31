const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

const vapidKeys = webpush.generateVAPIDKeys();
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', vapidKeys.publicKey, vapidKeys.privateKey);

let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; 

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });

// Tự động quét và xóa sạch tin nhắn lưu trữ của phòng chat sau mỗi 20 phút (1.200.000 mili giây)
setInterval(() => {
    mangTinNhanServer = []; // Xóa mảng tin nhắn trên server
    io.emit('lenh_xoa_sach_phong_chat_client'); // Lệnh cho các client tự xóa khung chat
    console.log('Hệ thống tự động: Đã quét sạch rác tin nhắn phòng chat sau 20 phút.');
}, 1200000);

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        if (!username || username === "ẩn danh") return callback({ success: false, msg: 'Tên không hợp lệ!' });
        
        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true });
        } else {
            if (danhSachTaiKhoan[username] === password) callback({ success: true });
            else callback({ success: false, msg: 'Sai mật khẩu!' });
        }
    });

    socket.on('gui_tin_nhan_server', (data) => {
        mangTinNhanServer.push(data);
        socket.broadcast.emit('nhan_tin_nhan_client', data);
    });

    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        danhSachCamServer[socket.id] = data.ten;
        if (callback) callback({ allowed: true });
        socket.broadcast.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    socket.on('rtc_tin_hieu_chuyen_tiep', (data) => {
        if (data && data.to === 'ALL_ROOM') {
            socket.broadcast.emit('rtc_tin_hieu_nhan_ve', {
                sender: socket.id,
                type: data.type,
                base64: data.base64,
                isMirror: data.isMirror,
                label: data.label
            });
        }
    });

    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    socket.on('disconnect', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại: http://localhost:${PORT}`); });
