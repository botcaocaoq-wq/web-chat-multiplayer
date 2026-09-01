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
let mangThongBaoSubscriptions = []; 

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });
app.get('/notice', (req, res) => { res.sendFile(__dirname + '/notice.html'); });

app.get('/vapid-public-key', (req, res) => { res.send(vapidKeys.publicKey); });

app.post('/save-subscription', (req, res) => {
    const sub = req.body;
    if (sub && sub.endpoint) mangThongBaoSubscriptions.push(sub);
    res.sendStatus(201);
});

// Gửi thông tin lời mời gọi Invite đến toàn bộ mọi người qua Web-Push
app.post('/gui-lenh-invite-all', (req, res) => {
    const { nguoiMoi } = req.body;
    const payload = JSON.stringify({
        title: `🔥 Lời mời từ ${nguoiMoi}`,
        body: `Vào Chatwold tâm sự với tao đi bạn ơi! Có người đang đợi nè!`
    });
    mangThongBaoSubscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(() => {});
    });
    res.sendStatus(200);
});

setInterval(() => {
    mangTinNhanServer = []; 
    io.emit('lenh_xoa_sach_phong_chat_client'); 
}, 1200000);

function phatTinHieuSoNguoiOnline() {
    io.emit('cap_nhat_so_nguoi_online_he_thong', io.sockets.sockets.size);
}

io.on('connection', (socket) => {
    phatTinHieuSoNguoiOnline();

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
    });

    socket.on('disconnect', () => {
        phatTinHieuSoNguoiOnline();
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server port: ${PORT}`); });
