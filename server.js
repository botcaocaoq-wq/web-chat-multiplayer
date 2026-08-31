const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const webpush = require('web-push');

app.use(express.json());
app.use(express.static(__dirname));

const vapidKeys = webpush.generateVAPIDKeys();
const publicVapidKey = vapidKeys.publicKey;
const privateVapidKey = vapidKeys.privateKey;
webpush.setVapidDetails('mailto:botcaocaoq@gmail.com', publicVapidKey, privateVapidKey);

let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; // Lưu dạng { idSocket: nickname }

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });
app.get('/vapid-public-key', (req, res) => { res.send(publicVapidKey); });

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);

    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        if (!username || username === "ẩn danh") return callback({ success: false, msg: 'Tên không hợp lệ!' });
        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true, isNew: true });
        } else {
            if (danhSachTaiKhoan[username] === password) callback({ success: true, isNew: false });
            else callback({ success: false, msg: 'Sai mật khẩu!' });
        }
    });

    socket.on('lay_lich_su_khi_vao_sau', () => {
        socket.emit('tra_lich_su_cho_nguoi_moi', mangTinNhanServer);
        socket.emit('dong_bo_tat_ca_camera_hieng_tai', danhSachCamServer);
    });

    // 🛠️ MỚI WEBRTC: Kiểm tra phòng đầy 4 người phát trực tiếp
    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        const soLuongCam = Object.keys(danhSachCamServer).length;
        if (soLuongCam >= 4) {
            return callback({ allowed: false, msg: "Phòng đã đầy (Tối đa 4 luồng phát)!" });
        }
        danhSachCamServer[socket.id] = data.ten;
        callback({ allowed: true });
        io.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    // 🛠️ MỚI WEBRTC: Định tuyến các gói bắt tay kỹ thuật (Offer, Answer, ICE Candidate) đi thẳng giữa 2 trình duyệt
    socket.on('rtc_tin_hieu_chuyen_tiep', (data) => {
        io.to(data.to).emit('rtc_tin_hieu_nhan_ve', {
            sender: socket.id,
            type: data.type,
            sdp: data.sdp,
            candidate: data.candidate
        });
    });

    socket.on('chu_dong_tat_camera_server', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });

    socket.on('gui_tin_nhan_mau', (data) => {
        const tinNhanMoi = { loai: data.loai, ten: data.ten, chu: data.chu, thoiGian: Date.now() };
        mangTinNhanServer.push(tinNhanMoi);
        io.emit('tin_nhan_moi_tu_server', tinNhanMoi);
    });

    socket.on('disconnect', () => {
        if (danhSachCamServer[socket.id]) {
            delete danhSachCamServer[socket.id];
            io.emit('co_nguoi_vua_tat_camera', { idSocket: socket.id });
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại port: ${PORT}`); });
