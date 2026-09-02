const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.json());
app.use(express.static(__dirname));

let mangTinNhanServer = []; 
let danhSachTaiKhoan = {};   
let danhSachCamServer = {}; 

app.get('/', (req, res) => { res.sendFile(__dirname + '/index.html'); });
app.get('/camera', (req, res) => { res.sendFile(__dirname + '/index2.html'); });

// Tự động quét dọn dẹp sạch rác dữ liệu phòng chat sau mỗi 20 phút (1.200.000 mili giây)
setInterval(() => {
    mangTinNhanServer = []; 
    io.emit('lenh_xoa_sach_phong_chat_client'); 
    console.log('Hệ thống tự động: Đã quét sạch rác tin nhắn phòng chat sau 20 phút.');
}, 1200000);

// Hàm tính toán và phát quảng bá số người online thực tế thời gian thực cho tất cả mọi máy
function phatTinHieuSoNguoiOnline() {
    const tongSoThietBi = io.sockets.sockets.size;
    io.emit('cap_nhat_so_nguoi_online_he_thong', tongSoThietBi);
}

io.on('connection', (socket) => {
    console.log('Thiết bị kết nối: ' + socket.id);
    phatTinHieuSoNguoiOnline(); // Có người vừa mở web -> Cập nhật số người online lập tức

    socket.on('dang_nhap_he_thong', (data, callback) => {
        const username = data.ten.trim().toLowerCase();
        const password = data.matKhau;
        if (!username || username === "ẩn danh") return callback({ success: false, msg: 'Tên không hợp lệ!' });
        
        if (!danhSachTaiKhoan[username]) {
            danhSachTaiKhoan[username] = password;
            callback({ success: true });
            phatTinHieuSoNguoiOnline(); // ÉP ĐỒNG BỘ: Tính lại số người online ngay khi tài khoản mới vào phòng thành công
        } else {
            if (danhSachTaiKhoan[username] === password) {
                callback({ success: true });
                phatTinHieuSoNguoiOnline(); // ÉP ĐỒNG BỘ: Tính lại số người online ngay khi tài khoản cũ vào phòng thành công
            }
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
        phatTinHieuSoNguoiOnline(); // Trả kết quả online lập tức khi máy vừa nạp lịch sử
    });

    socket.on('xin_phep_bat_camera_server', (data, callback) => {
        danhSachCamServer[socket.id] = data.ten;
        if (callback) callback({ allowed: true });
        socket.broadcast.emit('co_nguoi_vua_bat_camera', { idSocket: socket.id, ten: data.ten });
    });

    // TRUNG CHUYỂN REAL-TIME: Điều phối mảng dữ liệu ảnh băm liên tục từ Canvas chạy xuyên tab ẩn
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
        phatTinHieuSoNguoiOnline(); // ÉP ĐỒNG BỘ: Giảm số người online ngay giây phút có người tắt tab thoát web
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Server chạy tại port: ${PORT}`); });
