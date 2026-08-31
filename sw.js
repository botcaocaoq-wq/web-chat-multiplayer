// File này sẽ chạy ngầm dưới hệ thống Windows ngay cả khi bạn đã tắt web
self.addEventListener('push', function(event) {
    let data = { title: 'Tin nhắn mới!', body: 'Ai đó vừa nhắn cho bạn.' };
    
    // Nếu server có gửi nội dung tin nhắn về thì lấy, không thì dùng chữ mặc định
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: 'https://flaticon.com',
        badge: 'https://flaticon.com',
        tag: 'chat-notification',
        renotify: true
    };

    // Bắn thông báo lên màn hình Windows
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Khi người dùng bấm vào thông báo thì tự động mở lại trang web chat
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});
