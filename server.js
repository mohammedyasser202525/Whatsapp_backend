const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const { executablePath } = require('puppeteer');
const qrcode = require('qrcode-terminal');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');

// Initialize Express app
const app = express();

// Setup CORS to accept any origin
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Setup multer for file storage with better error handling
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads';
        try {
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        } catch (error) {
            cb(new Error('Could not create upload directory'));
        }
    },
    filename: function (req, file, cb) {
        // Sanitize filename and add timestamp
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        const safeName = `${timestamp}${ext}`.replace(/[^a-zA-Z0-9.-]/g, '');
        cb(null, safeName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 16 * 1024 * 1024, // 16MB max file size for WhatsApp
    },
    fileFilter: (req, file, cb) => {
        console.log('Received file:', {
            originalname: file.originalname,
            mimetype: file.mimetype
        });

        const allowedMimes = [
            'image/jpeg',
            'image/png',
            'image/gif',
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
            'video/webm',
            'video/3gpp',
            'video/3gpp2',
            'audio/mpeg',
            'audio/wav',
            'audio/ogg',
            'audio/webm',
            'audio/mp4',
            'audio/aac',
            'audio/x-m4a',
            'application/ogg',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'application/rtf',
            'application/zip',
            'application/x-zip-compressed'
        ];

        const ext = path.extname(file.originalname).toLowerCase();
        const is3gp = ext === '.3gp' || ext === '.3gpp';
        const isTextFile = ext === '.txt';
        const isWordFile = ext === '.doc' || ext === '.docx';

        if (allowedMimes.includes(file.mimetype) || 
            file.mimetype.startsWith('audio/') || 
            file.mimetype.startsWith('video/') || 
            file.mimetype.startsWith('image/') ||
            file.mimetype.startsWith('application/') ||
            file.mimetype.startsWith('text/') ||
            is3gp || isTextFile || isWordFile) {
            cb(null, true);
        } else {
            console.log('Rejected file type:', file.mimetype, 'with extension:', ext);
            cb(new Error(`نوع الملف غير مدعوم: ${file.mimetype}`));
        }
    }
});

// Middleware
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true, limit: '16mb' }));
app.use('/uploads', express.static('uploads'));

let client;
let connectionStatus = 'disconnected';
let qrCodeData = null;

// Function to clear all WhatsApp related folders
function clearWhatsAppFolders() {
    const foldersToDelete = [
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), '.wwebjs_auth'),
        path.join(process.cwd(), '.wwebjs_cache')
    ];

    for (const folder of foldersToDelete) {
        if (fs.existsSync(folder)) {
            try {
                fs.rmSync(folder, { recursive: true, force: true });
                console.log(`Cleared folder: ${folder}`);
            } catch (error) {
                console.error(`Error clearing folder ${folder}:`, error);
            }
        }
    }
}

async function destroyClient() {
    connectionStatus = 'disconnecting';
    if (client) {
        try {
            await client.destroy();
            client = null;
        } catch (error) {
            console.error('Error destroying client:', error);
        }
    }
    connectionStatus = 'disconnected';
    qrCodeData = null;
    clearWhatsAppFolders(); // Clear all WhatsApp related folders
}

function initializeWhatsApp() {
    connectionStatus = 'initializing';
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            executablePath: executablePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', (qr) => {
        connectionStatus = 'waiting-for-qr';
        qrCodeData = qr;
        qrcode.generate(qr, { small: true });
        console.log('QR Code generated! Scan with WhatsApp');
    });

    client.on('loading_screen', (percent, message) => {
        connectionStatus = `connecting:${percent}`;
        console.log('Loading:', percent, '%', message);
    });

    client.on('ready', () => {
        connectionStatus = 'connected';
        qrCodeData = null;
        console.log('WhatsApp client is ready!');
    });

    client.on('authenticated', () => {
        connectionStatus = 'authenticating';
        console.log('WhatsApp authenticated successfully!');
    });

    client.on('auth_failure', (msg) => {
        console.error('Authentication failed:', msg);
        connectionStatus = 'disconnected';
        clearWhatsAppFolders();
    });

    client.on('disconnected', async () => {
        console.log('WhatsApp disconnected!');
        await destroyClient();
        initializeWhatsApp();
    });

    try {
        client.initialize().catch(error => {
            console.error('Error during initialization:', error);
            connectionStatus = 'disconnected';
            clearWhatsAppFolders();
        });
    } catch (error) {
        console.error('Error initializing client:', error);
        connectionStatus = 'disconnected';
        clearWhatsAppFolders();
    }
}

// Initialize WhatsApp client
initializeWhatsApp();

// Routes
app.get('/status', (req, res) => {
    res.json({ 
        status: connectionStatus,
        qrCode: qrCodeData
    });
});

app.post('/disconnect', async (req, res) => {
    try {
        await destroyClient();
        connectionStatus = 'initializing';
        initializeWhatsApp();
        
        res.json({ 
            success: true, 
            message: 'Disconnected successfully',
            status: connectionStatus
        });
    } catch (error) {
        console.error('Error during disconnect:', error);
        connectionStatus = 'initializing';
        qrCodeData = null;
        initializeWhatsApp();
        
        res.json({ 
            success: true, 
            message: 'Disconnected with recovery',
            status: connectionStatus
        });
    }
});

function formatPhoneNumber(number, countryCode) {
  let phone = number.toString().replace(/\D/g, '');

  switch (countryCode) {
    case 'SA':
      phone = phone.startsWith('0') ? phone.substring(1) : phone;
      if (!phone.startsWith('966')) {
        phone = `966${phone}`;
      }
      break;
    case '20':
      if (!phone.startsWith('20')) {
        phone = `20${phone}`;
      }
      break;
    default:
      break;
  }
  
  return phone;
}

// New endpoint for sending a single media file with caption
app.post('/send-single-media', async (req, res) => {
    try {
        const { numbers, mediaPath, caption, country } = req.body;
        
        if (!client) {
            return res.status(400).json({ error: 'WhatsApp client not initialized' });
        }

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: 'يجب توفير قائمة صالحة من الأرقام' });
        }

        const results = { success: [], failed: [] };

        for (const number of numbers) {
            try {
                const formattedNumber = formatPhoneNumber(number, country); 
                const chatId = `${formattedNumber}@c.us`; 

                const isRegistered = await client.isRegisteredUser(chatId);
                if (!isRegistered) {
                    throw new Error('رقم غير مسجل في واتساب');
                }

                const fullPath = path.join(process.cwd(), mediaPath);
                if (!fs.existsSync(fullPath)) {
                    throw new Error('ملف الوسائط غير موجود');
                }

                const mimeType = mime.lookup(fullPath);
                if (!mimeType) {
                    throw new Error('نوع الملف غير مدعوم');
                }

                const fileStats = fs.statSync(fullPath);
                if (fileStats.size > 16 * 1024 * 1024) {
                    throw new Error('حجم الملف كبير جداً. الحد الأقصى هو 16 ميجابايت');
                }

                const base64Data = fs.readFileSync(fullPath, { encoding: 'base64' });
                const media = new MessageMedia(
                    mimeType,
                    base64Data,
                    path.basename(fullPath)
                );

                await client.sendMessage(chatId, media, {
                    sendMediaAsDocument: mimeType.startsWith('video/'),
                    caption: caption
                });

                results.success.push(formattedNumber);

            } catch (error) {
                results.failed.push({
                    number: formattedNumber,
                    reason: error.message
                });
            }
        }

        res.json({ results });

    } catch (error) {
        res.status(500).json({ error: 'خطأ في معالجة الطلب: ' + error.message });
    }
});

// Modified bulk messages endpoint to handle individual captions
app.post('/send-bulk-messages', async (req, res) => {
    try {
        const { numbers, message, mediaFiles, country } = req.body;
        
        if (!client) {
            return res.status(400).json({ error: 'WhatsApp client not initialized' });
        }

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: 'يجب توفير قائمة صالحة من الأرقام' });
        }

        const results = { success: [], failed: [] };

        for (const number of numbers) {
            let formattedNumber;
            try {
                formattedNumber = formatPhoneNumber(number, country); // التنسيق بناءً على الدولة
                const chatId = `${formattedNumber}@c.us`; // استخدام الرقم المنسق

                const isRegistered = await client.isRegisteredUser(chatId);
                if (!isRegistered) {
                    throw new Error('رقم غير مسجل في واتساب');
                }

                if (message) {
                    await client.sendMessage(chatId, message);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Send media files with their individual captions
                if (mediaFiles && mediaFiles.length > 0) {
                    for (const { path: mediaPath, caption } of mediaFiles) {
                        try {
                            const fullPath = path.join(process.cwd(), mediaPath);
                            
                            if (!fs.existsSync(fullPath)) {
                                throw new Error('ملف الوسائط غير موجود');
                            }

                            const mimeType = mime.lookup(fullPath);
                            if (!mimeType) {
                                throw new Error('نوع الملف غير مدعوم');
                            }

                            const fileStats = fs.statSync(fullPath);
                            if (fileStats.size > 16 * 1024 * 1024) {
                                throw new Error('حجم الملف كبير جداً. الحد الأقصى هو 16 ميجابايت');
                            }

                            const base64Data = fs.readFileSync(fullPath, { encoding: 'base64' });
                            const media = new MessageMedia(
                                mimeType,
                                base64Data,
                                path.basename(fullPath)
                            );

                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await client.sendMessage(chatId, media, {
                                sendMediaAsDocument: mimeType.startsWith('video/'),
                                caption: caption
                            });

                        } catch (mediaError) {
                            console.error('Media error:', mediaError);
                            throw new Error(`فشل في إرسال الوسائط: ${mediaError.message}`);
                        }
                    }
                }

                results.success.push(formattedNumber);

            } catch (error) {
                results.failed.push({
                    number: formattedNumber || number,
                    reason: error.message
                });
            }
        }

        res.json({ results });

    } catch (error) {
        res.status(500).json({ error: 'خطأ في معالجة الطلب: ' + error.message });
    }
});

app.post('/upload-media', (req, res) => {
    upload.single('media')(req, res, function(err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ 
                error: 'خطأ في رفع الملف',
                details: err.message 
            });
        } else if (err) {
            return res.status(400).json({ 
                error: 'خطأ في رفع الملف',
                details: err.message 
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم اختيار ملف' });
        }

        res.json({ 
            success: true,
            filePath: req.file.path,
            fileName: req.file.filename,
            mimeType: req.file.mimetype
        });
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
