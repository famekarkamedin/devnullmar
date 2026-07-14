const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));


// Настройка сессий
app.use(session({
    secret: 'nullmarket_super_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true
    }
}));

// Настройка загрузки аватаров и файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let dir = './uploads';
        if (file.fieldname === 'avatar') dir = './uploads/avatars';
        else if (file.fieldname === 'attachments' || file.fieldname === 'attachment') dir = './uploads/attachments';
        else if (file.fieldname === 'screenshot') dir = './uploads/screenshots';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Инициализация БД
const db = new sqlite3.Database('./nullmarket.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err.message);
    } else {
        console.log('Подключено к SQLite базе данных');
        initDatabase();
    }
});

// Функция для получения уровня роли
function getRoleLevel(role) {
    const levels = {
        'user': 0,
        'beta_tester': 20,
        'support_trainee': 30,
        'tech_support': 35,
        'pro_support': 40,
        'recruiter': 60,
        'smm_manager': 70,
        'pr_manager': 75,
        'senior_pr_manager': 80,
        'content_label_moderator': 86,
        'content_moderator': 87,
        'senior_content_label_moderator': 88,
        'senior_content_moderator': 89,
        'head_beta_testers': 90,
        'head_cooperation': 91,
        'head_marketing': 92,
        'head_support': 93,
        'head_moderation': 94,
        'tech_admin': 95,
        'developer': 96,
        'tech_lead': 97,
        'ciso': 98,
        'ceo': 99,
        'board_of_directors': 100
    };
    return levels[role] || 0;
}

function getNextRole(currentRole) {
    const promotionPath = {
        'user': 'beta_tester',
        'beta_tester': 'support_trainee',
        'support_trainee': 'tech_support',
        'tech_support': 'pro_support',
        'pro_support': 'recruiter',
        'recruiter': 'smm_manager',
        'smm_manager': 'pr_manager',
        'pr_manager': 'senior_pr_manager',
        'senior_pr_manager': 'content_label_moderator',
        'content_label_moderator': 'content_moderator',
        'content_moderator': 'senior_content_label_moderator',
        'senior_content_label_moderator': 'senior_content_moderator',
        'senior_content_moderator': 'head_beta_testers',
        'head_beta_testers': 'head_cooperation',
        'head_cooperation': 'head_marketing',
        'head_marketing': 'head_support',
        'head_support': 'head_moderation',
        'head_moderation': 'tech_admin',
        'tech_admin': 'developer',
        'developer': 'tech_lead',
        'tech_lead': 'ciso',
        'ciso': 'ceo',
        'ceo': 'board_of_directors',
        'board_of_directors': null
    };
    return promotionPath[currentRole] || null;
}

function getRoleName(role) {
    const names = {
        'user': 'Пользователь',
        'beta_tester': 'Бета-Тестер',
        'support_trainee': 'Стажер Поддержки',
        'tech_support': 'Тех. Поддержка',
        'pro_support': 'Проф. Поддержка',
        'recruiter': 'Рекрутер',
        'smm_manager': 'Смм Менеджер',
        'pr_manager': 'Пиар Менеджер',
        'senior_pr_manager': 'Старший Пиар Менеджер',
        'content_label_moderator': 'Модератор разметки контента',
        'content_moderator': 'Модератор Контента',
        'senior_content_label_moderator': 'Старший Модератор разметки контента',
        'senior_content_moderator': 'Старший Модератор контента',
        'head_beta_testers': 'Руководитель Бета-Тестеров',
        'head_cooperation': 'Руководитель Сотрудничеств',
        'head_marketing': 'Руководитель Маркетинга и RP',
        'head_support': 'Руководитель Поддержки',
        'head_moderation': 'Руководитель Модерации',
        'tech_admin': 'Тех. Администратор',
        'developer': 'Разработчики',
        'tech_lead': 'Ведущий разработчик',
        'ciso': 'Глава Безопасности',
        'ceo': 'Исполнительный Директор',
        'board_of_directors': 'Совет Директоров'
    };
    return names[role] || role;
}

function logAdminAction(adminId, action, details) {
    db.get(`SELECT name FROM users WHERE id = ?`, [adminId], (err, user) => {
        const adminName = user ? user.name : 'Unknown';
        db.run(`INSERT INTO admin_logs (admin_id, admin_name, action, details) VALUES (?, ?, ?, ?)`,
            [adminId, adminName, action, details]);
    });
}

function updateUserStats(userId, statField, increment = 1) {
    db.run(`UPDATE users SET ${statField} = COALESCE(${statField}, 0) + ? WHERE id = ?`, [increment, userId]);
}

function addColumnIfNotExists(table, column, type, callback) {
    db.all(`PRAGMA table_info(${table})`, (err, columns) => {
        if (!err && columns) {
            const columnNames = columns.map(c => c.name);
            if (!columnNames.includes(column)) {
                db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, (err) => {
                    if (!err) console.log(`Добавлена колонка ${column} в ${table}`);
                    if (callback) callback();
                });
            } else if (callback) callback();
        } else if (callback) callback();
    });
}

function generateUserId() { return Math.floor(10000000 + Math.random() * 90000000).toString(); }
function generateTicketNumber() { return 'TKT' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000); }
function generateReportNumber() { return 'BR' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000); }

function checkFastReply(userId) {
    return new Promise((resolve) => {
        db.get(
            `SELECT 
                (strftime('%s', created_at) - strftime('%s', (SELECT created_at FROM ticket_replies WHERE ticket_id = tickets.id AND is_staff = 1 ORDER BY created_at ASC LIMIT 1))) as reply_time
             FROM tickets 
             WHERE user_id = ? AND status = 'closed'
             ORDER BY created_at DESC LIMIT 1`,
            [userId],
            (err, row) => {
                if (err || !row || row.reply_time === null) {
                    resolve(false);
                    return;
                }
                // Ответ получен за 5 минут (300 секунд)
                resolve(row.reply_time <= 300);
            }
        );
    });
}

// Функция проверки статуса D&D
function checkDNDStatus(userId, requirementType) {
    return new Promise((resolve) => {
        // Получаем роль пользователя и проверяем, соответствует ли она D&D роли
        const dndRoles = {
            'dnd_wizard': 'wizard',
            'dnd_orc': 'orc',
            'dnd_rogue': 'rogue',
            'dnd_warrior': 'warrior',
            'dnd_dragonborn': 'dragonborn',
            'dnd_dwarf': 'dwarf',
            'dnd_elf': 'elf',
            'dnd_halfling': 'halfling',
            'dnd_tiefling': 'tiefling',
            'dnd_gnome': 'gnome',
            'dnd_barbarian': 'barbarian'
        };
        
        // Проверяем, есть ли у пользователя роль из user_achievements
        db.get(
            `SELECT ua.is_completed 
             FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки знака зодиака
function checkZodiacStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT birthday FROM users WHERE id = ?`,
            [userId],
            (err, user) => {
                if (err || !user || !user.birthday) {
                    resolve(false);
                    return;
                }
                
                const birthDate = new Date(user.birthday);
                const month = birthDate.getMonth() + 1;
                const day = birthDate.getDate();
                
                const zodiacMap = {
                    'zodiac_aries': { start: [3, 21], end: [4, 19] },
                    'zodiac_taurus': { start: [4, 20], end: [5, 20] },
                    'zodiac_gemini': { start: [5, 21], end: [6, 20] },
                    'zodiac_cancer': { start: [6, 21], end: [7, 22] },
                    'zodiac_leo': { start: [7, 23], end: [8, 22] },
                    'zodiac_virgo': { start: [8, 23], end: [9, 22] },
                    'zodiac_libra': { start: [9, 23], end: [10, 22] },
                    'zodiac_scorpio': { start: [10, 23], end: [11, 21] },
                    'zodiac_sagittarius': { start: [11, 22], end: [12, 21] },
                    'zodiac_capricorn': { start: [12, 22], end: [1, 19] },
                    'zodiac_aquarius': { start: [1, 20], end: [2, 18] },
                    'zodiac_pisces': { start: [2, 19], end: [3, 20] }
                };
                
                const zodiac = zodiacMap[requirementType];
                if (!zodiac) {
                    resolve(false);
                    return;
                }
                
                const zodiacStart = zodiac.start;
                const zodiacEnd = zodiac.end;
                
                // Определяем знак зодиака
                let isMatch = false;
                
                // Для Козерога (переход через год)
                if (requirementType === 'zodiac_capricorn') {
                    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) {
                        isMatch = true;
                    }
                } else {
                    // Для всех остальных знаков
                    const startMonth = zodiacStart[0];
                    const startDay = zodiacStart[1];
                    const endMonth = zodiacEnd[0];
                    const endDay = zodiacEnd[1];
                    
                    if ((month === startMonth && day >= startDay) || 
                        (month === endMonth && day <= endDay) ||
                        (month > startMonth && month < endMonth) ||
                        (startMonth > endMonth && (month >= startMonth || month <= endMonth))) {
                        isMatch = true;
                    }
                }
                
                resolve(isMatch);
            }
        );
    });
}

// Функция проверки статуса Мавс
function checkMavsStatus(userId, requirementType) {
    return new Promise((resolve) => {
        // Проверяем, есть ли у пользователя достижение MAVS
        db.get(
            `SELECT ua.is_completed 
             FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса тестера NULLMARKET
function checkTesterStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса #Неткибербуллингу
function checkNCBStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки IT-статуса
function checkITStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса питомцев
function checkPetsStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса SuperUp
function checkSuperUpStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Космический фестиваль
function checkSpaceStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Викинги
function checkVikingStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса NULLMARKET Шаги
function checkNMSStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки шагов NULLMARKET
function checkNMSSteps(userId, requiredSteps) {
    return new Promise((resolve) => {
        // Проверяем, есть ли у пользователя достижение с требуемым количеством шагов
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.requirement_type = 'nms_steps' AND a.requirement_value >= ? AND ua.is_completed = 1`,
            [userId, requiredSteps],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса NULLMARKET Билеты
function checkNMTStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Тридевятое царство
function checkFairyStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Труселя
function checkTrousersStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Дорожные знаки
function checkRoadStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Жабаки
function checkFrogStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Горностай
function checkErmineStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Утя
function checkDuckStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}

// Функция проверки статуса Римская империя
function checkRomanStatus(userId, requirementType) {
    return new Promise((resolve) => {
        db.get(
            `SELECT is_completed FROM user_achievements ua 
             JOIN achievements a ON ua.achievement_id = a.id 
             WHERE ua.user_id = ? AND a.code = ? AND ua.is_completed = 1`,
            [userId, requirementType.toUpperCase()],
            (err, row) => {
                resolve(!!row);
            }
        );
    });
}


// ============ ФУНКЦИЯ ПРОВЕРКИ ДОСТИЖЕНИЙ ============
async function checkAndUnlockAchievements(userId, actionType, actionValue = 1) {
    // Получаем статистику пользователя
    const stats = await new Promise((resolve) => {
        db.get(`SELECT 
            julianday('now') - julianday(created_at) as days_on_platform,
            (SELECT COUNT(*) FROM bug_reports WHERE user_id = ?) as reports_created,
            (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND status = 'fixed') as reports_fixed,
            (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'critical') as critical_reports,
            (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'high') as high_reports,
            (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'medium') as medium_reports,
            (SELECT COUNT(*) FROM test_cases WHERE author_id = ?) as testcases_created,
            (SELECT COUNT(*) FROM checklists WHERE author_id = ?) as checklists_created,
            (SELECT COUNT(*) FROM checklists WHERE author_id = ? AND status = 'completed') as checklists_completed,
            (SELECT COUNT(*) FROM report_comments WHERE user_id = ?) as comments_count,
            (SELECT COUNT(*) FROM orders WHERE user_id = ?) as purchases_count,
            (SELECT COUNT(*) FROM user_items WHERE user_id = ?) as sales_count,
            (SELECT COUNT(*) FROM user_achievements WHERE user_id = ? AND is_completed = 1) as achievements_count,
            (SELECT balance FROM users WHERE id = ?) as balance,
            (SELECT COUNT(*) FROM users WHERE referrer_id = ?) as referrals,
            (SELECT COUNT(*) FROM support_tickets WHERE user_id = ?) as support_tickets,
            (SELECT COUNT(*) FROM posts WHERE user_id = ?) as posts_count,
            (SELECT COUNT(*) FROM likes WHERE user_id = ?) as likes_received,
            (SELECT COUNT(*) FROM reviews WHERE user_id = ?) as reviews_received,
            (SELECT COUNT(*) FROM reviews WHERE user_id = ? AND rating >= 4) as positive_reviews,
            (SELECT COUNT(*) FROM follows WHERE following_id = ?) as followers,
            (SELECT COUNT(*) FROM withdrawals WHERE user_id = ?) as withdrawal_count,
            (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE user_id = ?) as purchase_amount,
            (SELECT COALESCE(SUM(amount), 0) FROM user_items WHERE user_id = ?) as sale_amount,
            (SELECT COUNT(*) FROM profile_views WHERE profile_id = ?) as profile_views,
            (SELECT email_confirmed FROM users WHERE id = ?) as email_confirmed,
            (SELECT phone_verified FROM users WHERE id = ?) as phone_verified,
            (SELECT avatar_url FROM users WHERE id = ?) as avatar_set,
            (SELECT bio FROM users WHERE id = ?) as bio_filled,
            (SELECT location FROM users WHERE id = ?) as location_set,
            (SELECT birthday FROM users WHERE id = ?) as birthday_set,
            (SELECT interests FROM users WHERE id = ?) as interests_set,
            (SELECT is_verified FROM users WHERE id = ?) as verified,
            (SELECT social_linked FROM users WHERE id = ?) as social_linked,
            (SELECT terms_accepted FROM users WHERE id = ?) as terms_accepted,
            (SELECT first_login FROM users WHERE id = ?) as first_login,
            (SELECT profile_complete FROM users WHERE id = ?) as profile_complete,
            (SELECT login_streak FROM users WHERE id = ?) as login_streak,
            (SELECT time_spent_hours FROM users WHERE id = ?) as time_spent_hours
        `, [userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId, userId], (err, row) => {
            resolve(row || {});
        });
    });
    
    // Получаем все достижения
    const achievements = await new Promise((resolve) => {
        db.all(`SELECT * FROM achievements`, (err, rows) => {
            resolve(rows || []);
        });
    });
    
    const newUnlocked = [];
    
    for (const ach of achievements) {
        // Проверяем, не разблокировано ли уже
        const isUnlocked = await new Promise((resolve) => {
            db.get(`SELECT id FROM user_achievements WHERE user_id = ? AND achievement_id = ? AND is_completed = 1`, [userId, ach.id], (err, row) => {
                resolve(!!row);
            });
        });
        
        if (isUnlocked) continue;
        
        let completed = false;
        let progress = 0;
        let currentValue = 0;
        const reqValue = ach.requirement_value;
        
        // Определяем текущее значение в зависимости от типа
        switch(ach.requirement_type) {
            // ====== ПРИВЕТСТВИЕ ======
            case 'registered':
                currentValue = 1;
                break;
            case 'email_confirmed':
                currentValue = stats.email_confirmed || 0;
                break;
            case 'phone_verified':
                currentValue = stats.phone_verified || 0;
                break;
            case 'terms_accepted':
                currentValue = stats.terms_accepted || 0;
                break;
            case 'first_login':
                currentValue = stats.first_login || 0;
                break;
            case 'avatar_set':
                currentValue = stats.avatar_set ? 1 : 0;
                break;
            case 'bio_filled':
                currentValue = stats.bio_filled ? 1 : 0;
                break;
            
            // ====== ПРОФИЛЬ ======
            case 'profile_complete':
                currentValue = stats.profile_complete || 0;
                break;
            case 'social_linked':
                currentValue = stats.social_linked || 0;
                break;
            case 'profile_views':
                currentValue = stats.profile_views || 0;
                break;
            case 'followers':
                currentValue = stats.followers || 0;
                break;
            case 'location_set':
                currentValue = stats.location_set ? 1 : 0;
                break;
            case 'birthday_set':
                currentValue = stats.birthday_set ? 1 : 0;
                break;
            case 'interests_set':
                currentValue = stats.interests_set ? 1 : 0;
                break;
            case 'verified':
                currentValue = stats.verified || 0;
                break;
            
            // ====== АКТИВНОСТЬ ======
            case 'login_streak':
                currentValue = stats.login_streak || 0;
                break;
            case 'time_spent_hours':
                currentValue = stats.time_spent_hours || 0;
                break;
            case 'posts_count':
                currentValue = stats.posts_count || 0;
                break;
            case 'likes_received':
                currentValue = stats.likes_received || 0;
                break;
            
            // ====== ПОКУПКИ ======
            case 'purchases_count':
                currentValue = stats.purchases_count || 0;
                break;
            case 'purchase_amount':
                currentValue = stats.purchase_amount || 0;
                break;
            
            // ====== ПРОДАЖИ ======
            case 'sales_count':
                currentValue = stats.sales_count || 0;
                break;
            case 'sale_amount':
                currentValue = stats.sale_amount || 0;
                break;
            
            // ====== РЕПУТАЦИЯ ======
            case 'reviews_received':
                currentValue = stats.reviews_received || 0;
                break;
            case 'positive_reviews_percent':
                const total = stats.reviews_received || 0;
                const positive = stats.positive_reviews || 0;
                currentValue = total > 0 ? Math.round((positive / total) * 100) : 0;
                break;
            
            // ====== КОЛЛЕКЦИОНЕР ======
            case 'achievements_count':
                currentValue = stats.achievements_count || 0;
                break;
            
            // ====== ФИНАНСЫ ======
            case 'balance_amount':
                currentValue = stats.balance || 0;
                break;
            case 'withdrawal_count':
                currentValue = stats.withdrawal_count || 0;
                break;
            
            // ====== ВЕТЕРАН ======
            case 'days_on_platform':
                currentValue = stats.days_on_platform || 0;
                break;
            
            // ====== ПРИГЛАШЕНИЯ ======
            case 'referrals':
                currentValue = stats.referrals || 0;
                break;
            
            // ====== ПОДДЕРЖКА ======
            case 'support_tickets':
                currentValue = stats.support_tickets || 0;
                break;
            case 'support_fast_reply':
                currentValue = await checkFastReply(userId) ? 1 : 0;
                break;
            
            // ====== D&D ======
            case 'dnd_wizard':
            case 'dnd_orc':
            case 'dnd_rogue':
            case 'dnd_warrior':
            case 'dnd_dragonborn':
            case 'dnd_dwarf':
            case 'dnd_elf':
            case 'dnd_halfling':
            case 'dnd_tiefling':
            case 'dnd_gnome':
            case 'dnd_barbarian':
                currentValue = await checkDNDStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ЗНАКИ ЗОДИАКА ======
            case 'zodiac_aries':
            case 'zodiac_taurus':
            case 'zodiac_gemini':
            case 'zodiac_cancer':
            case 'zodiac_leo':
            case 'zodiac_virgo':
            case 'zodiac_libra':
            case 'zodiac_scorpio':
            case 'zodiac_sagittarius':
            case 'zodiac_capricorn':
            case 'zodiac_aquarius':
            case 'zodiac_pisces':
                currentValue = await checkZodiacStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== Я БОГАТ ======
            case 'rich_status':
                currentValue = stats.balance >= 10000 ? 1 : 0;
                break;
            case 'rich_status_10':
                currentValue = stats.balance >= 100000 ? 1 : 0;
                break;
            case 'rich_status_100':
                currentValue = stats.balance >= 1000000 ? 1 : 0;
                break;
            case 'rich_status_1000':
                currentValue = stats.balance >= 10000000 ? 1 : 0;
                break;
            case 'rich_status_10000':
                currentValue = stats.balance >= 100000000 ? 1 : 0;
                break;
            
            // ====== МАВС ======
            case 'mavs_love':
            case 'mavs_sit':
            case 'mavs_happy':
            case 'mavs_question':
            case 'mavs_hello':
            case 'mavs_funny':
            case 'mavs_star':
            case 'mavs_hero':
            case 'mavs_legend':
                currentValue = await checkMavsStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== NULLMARKET TESTERS ======
            case 'nmt_1y':
                currentValue = stats.days_on_platform >= 365 ? 1 : 0;
                break;
            case 'nmt_3y':
                currentValue = stats.days_on_platform >= 1095 ? 1 : 0;
                break;
            case 'nmt_5y':
                currentValue = stats.days_on_platform >= 1825 ? 1 : 0;
                break;
            case 'nmt_7y':
                currentValue = stats.days_on_platform >= 2555 ? 1 : 0;
                break;
            case 'nmt_10y':
                currentValue = stats.days_on_platform >= 3650 ? 1 : 0;
                break;
            case 'nmt_invincible':
            case 'nmt_guilds':
                currentValue = await checkTesterStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== #НЕТКИБЕРБУЛЛИНГУ ======
            case 'ncb_antitoxin':
            case 'ncb_against':
            case 'ncb_think':
            case 'ncb_speak':
            case 'ncb_cry':
                currentValue = await checkNCBStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== IT-ПРОФЕССИИ ======
            case 'it_spec':
            case 'it_ready':
            case 'it_forward':
            case 'it_ideas':
            case 'it_ml':
            case 'it_pro':
            case 'it_developer':
                currentValue = await checkITStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ПИТОМЦЫ ======
            case 'pets_check':
            case 'pets_we':
            case 'pets_bimbo':
                currentValue = await checkPetsStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== SUPERUP ======
            case 'superup_1':
            case 'superup_2':
            case 'superup_3':
            case 'superup_4':
            case 'superup_5':
            case 'superup_6':
            case 'superup_7':
            case 'superup_8':
            case 'superup_9':
            case 'superup_10':
                currentValue = await checkSuperUpStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== КОСМИЧЕСКИЙ ФЕСТИВАЛЬ ======
            case 'space_1':
            case 'space_2':
            case 'space_3':
            case 'space_4':
            case 'space_5':
            case 'space_6':
                currentValue = await checkSpaceStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== СЕЗОН ВИКИНГОВ ======
            case 'viking_1':
            case 'viking_2':
            case 'viking_3':
            case 'viking_4':
            case 'viking_5':
            case 'viking_6':
                currentValue = await checkVikingStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== NULLMARKET ШАГИ ======
            case 'nms_walk':
            case 'nms_goal':
                currentValue = await checkNMSStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            case 'nms_10000':
            case 'nms_50000':
            case 'nms_100000':
                currentValue = await checkNMSSteps(userId, ach.requirement_value) ? 1 : 0;
                break;
            
            // ====== NULLMARKET БИЛЕТЫ ======
            case 'nmt_shaker':
            case 'nmt_party':
            case 'nmt_walk':
            case 'nmt_culture':
                currentValue = await checkNMTStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ТРИДЕВЯТОЕ ЦАРСТВО ======
            case 'fairy_1':
            case 'fairy_2':
            case 'fairy_3':
            case 'fairy_4':
            case 'fairy_5':
            case 'fairy_6':
                currentValue = await checkFairyStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ТРУСЕЛЯ ======
            case 'trousers_1':
            case 'trousers_2':
            case 'trousers_3':
            case 'trousers_4':
            case 'trousers_5':
            case 'trousers_6':
                currentValue = await checkTrousersStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ДОРОЖНЫЕ ЗНАКИ ======
            case 'road_1':
            case 'road_2':
            case 'road_3':
            case 'road_4':
            case 'road_5':
            case 'road_6':
                currentValue = await checkRoadStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ЖАБАКИ ======
            case 'frog_1':
            case 'frog_2':
            case 'frog_3':
            case 'frog_4':
            case 'frog_5':
            case 'frog_6':
                currentValue = await checkFrogStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== ХАЙ, Я ГОРНОСТАЙ ======
            case 'ermine_1':
            case 'ermine_2':
            case 'ermine_3':
            case 'ermine_4':
            case 'ermine_5':
            case 'ermine_6':
                currentValue = await checkErmineStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== УТЯ ======
            case 'duck_1':
            case 'duck_2':
            case 'duck_3':
            case 'duck_4':
            case 'duck_5':
            case 'duck_6':
                currentValue = await checkDuckStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== РИМСКАЯ ИМПЕРИЯ ======
            case 'roman_1':
            case 'roman_2':
            case 'roman_3':
            case 'roman_4':
            case 'roman_5':
            case 'roman_6':
                currentValue = await checkRomanStatus(userId, ach.requirement_type) ? 1 : 0;
                break;
            
            // ====== БАГ-РЕПОРТЫ (из старой системы) ======
            case 'reports_created':
                currentValue = stats.reports_created || 0;
                break;
            case 'reports_fixed':
                currentValue = stats.reports_fixed || 0;
                break;
            case 'critical_reports':
                currentValue = stats.critical_reports || 0;
                break;
            case 'high_reports':
                currentValue = stats.high_reports || 0;
                break;
            case 'medium_reports':
                currentValue = stats.medium_reports || 0;
                break;
            case 'testcases_created':
                currentValue = stats.testcases_created || 0;
                break;
            case 'checklists_created':
                currentValue = stats.checklists_created || 0;
                break;
            case 'checklists_completed':
                currentValue = stats.checklists_completed || 0;
                break;
            case 'comments_count':
                currentValue = stats.comments_count || 0;
                break;
            
            default:
                // Если тип не найден, пропускаем
                continue;
        }
        
        // Вычисляем прогресс
        progress = Math.min(reqValue, currentValue);
        completed = currentValue >= reqValue;
        
        // Обновляем или вставляем запись
        await new Promise((resolve) => {
            db.run(`INSERT OR REPLACE INTO user_achievements (user_id, achievement_id, progress, is_completed, unlocked_at)
                    VALUES (?, ?, ?, ?, CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END)`,
                [userId, ach.id, progress, completed ? 1 : 0, completed],
                function(err) {
                    if (err) console.error('Ошибка обновления достижения:', err);
                    resolve();
                }
            );
        });
        
        if (completed) {
            newUnlocked.push(ach);
            if (ach.points_reward > 0) {
                await new Promise((resolve) => {
                    db.run(`UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`, [ach.points_reward, userId], resolve);
                });
            }
        }
    }
    
    return newUnlocked;
}

function initAvailableIcons() {
    const icons = [
        // ===== СЕЗОН I =====
        { 
            role_key: 'season_i', 
            display_name: 'Сезон I: Рассвет', 
            icon_url: '../assets/icons/season_i.png', 
            color: '#fbbf24', 
            category: 'Сезон I', 
            can_assign: 'admin',
            description: 'Первый сезон NULLMARKET. Заря новой эры.'
        },
        
        // ===== СЕЗОН II =====
        { 
            role_key: 'season_ii', 
            display_name: 'Сезон II: Буря', 
            icon_url: '../assets/icons/season_ii.png', 
            color: '#f97316', 
            category: 'Сезон II', 
            can_assign: 'admin',
            description: 'Второй сезон. Время испытаний и роста.'
        },
        
        // ===== СЕЗОН III =====
        { 
            role_key: 'season_iii', 
            display_name: 'Сезон III: Кристалл', 
            icon_url: '../assets/icons/season_iii.png', 
            color: '#06b6d4', 
            category: 'Сезон III', 
            can_assign: 'admin',
            description: 'Третий сезон. Прозрачность и чистота.'
        },
        
        // ===== СЕЗОН IV =====
        { 
            role_key: 'season_iv', 
            display_name: 'Сезон IV: Тень', 
            icon_url: '../assets/icons/season_iv.png', 
            color: '#6b7280', 
            category: 'Сезон IV', 
            can_assign: 'admin',
            description: 'Четвёртый сезон. Тайны и открытия.'
        },
        
        // ===== СЕЗОН V =====
        { 
            role_key: 'season_v', 
            display_name: 'Сезон V: Пламя', 
            icon_url: '../assets/icons/season_v.png', 
            color: '#ef4444', 
            category: 'Сезон V', 
            can_assign: 'admin',
            description: 'Пятый сезон. Огонь страсти и энергии.'
        },
        
        // ===== СЕЗОН VI =====
        { 
            role_key: 'season_vi', 
            display_name: 'Сезон VI: Изумруд', 
            icon_url: '../assets/icons/season_vi.png', 
            color: '#10b981', 
            category: 'Сезон VI', 
            can_assign: 'admin',
            description: 'Шестой сезон. Рост и процветание.'
        },
        
        // ===== СЕЗОН VII =====
        { 
            role_key: 'season_vii', 
            display_name: 'Сезон VII: Сапфир', 
            icon_url: '../assets/icons/season_vii.png', 
            color: '#3b82f6', 
            category: 'Сезон VII', 
            can_assign: 'admin',
            description: 'Седьмой сезон. Мудрость и глубина.'
        },
        
        // ===== СЕЗОН VIII =====
        { 
            role_key: 'season_viii', 
            display_name: 'Сезон VIII: Аметист', 
            icon_url: '../assets/icons/season_viii.png', 
            color: '#8b5cf6', 
            category: 'Сезон VIII', 
            can_assign: 'admin',
            description: 'Восьмой сезон. Духовность и вдохновение.'
        },
        
        // ===== СЕЗОН IX =====
        { 
            role_key: 'season_ix', 
            display_name: 'Сезон IX: Рубин', 
            icon_url: '../assets/icons/season_ix.png', 
            color: '#ec4899', 
            category: 'Сезон IX', 
            can_assign: 'admin',
            description: 'Девятый сезон. Страсть и решимость.'
        },
        
        // ===== СЕЗОН X =====
        { 
            role_key: 'season_x', 
            display_name: 'Сезон X: Зенит', 
            icon_url: '../assets/icons/season_x.png', 
            color: '#fcd34d', 
            category: 'Сезон X', 
            can_assign: 'admin',
            description: 'Десятый сезон. Вершина мастерства.'
        },
		
        { 
            role_key: 'NullPremium_b', 
            display_name: 'NullPremium Bronze', 
            icon_url: '../assets/icons/nullpremiumb.png', 
            color: '#d0a85c', 
            category: 'prem', 
            can_assign: 'admin',
            description: 'Премиум подписка бронзового уровня'
        },
        { 
            role_key: 'NullPremium_s', 
            display_name: 'NullPremium Silver', 
            icon_url: '../assets/icons/nullpremiums.png', 
            color: '#b1afab', 
            category: 'prem', 
            can_assign: 'admin',
            description: 'Премиум подписка серебрянного уровня'
        },
        { 
            role_key: 'NullPremium_g', 
            display_name: 'NullPremium Gold', 
            icon_url: '../assets/icons/nullpremiumg.png', 
            color: '#e8e81a', 
            category: 'prem', 
            can_assign: 'admin',
            description: 'Премиум подписка золотого уровня'
        },
        { 
            role_key: 'NullPremium_p', 
            display_name: 'NullPremium Platinum', 
            icon_url: '../assets/icons/nullpremiump.png', 
            color: '#456db8', 
            category: 'prem', 
            can_assign: 'admin',
            description: 'Премиум подписка платинового уровня'
        },
        { 
            role_key: 'NullPremium_orb', 
            display_name: 'NullPremium Fantom', 
            icon_url: '../assets/icons/nullpremiumorb.png', 
            color: '#c91735', 
            category: 'prem', 
            can_assign: 'admin',
            description: 'Премиум подписка рубинового уровня'
        },
    ];

    icons.forEach(icon => {
        db.run(
            `INSERT OR IGNORE INTO available_icons (role_key, display_name, icon_url, color, description, category, can_assign)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [icon.role_key, icon.display_name, icon.icon_url, icon.color, icon.description || '', icon.category, icon.can_assign]
        );
    });
}

// ============ ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ============
function initDatabase() {
    console.log('📊 Запуск инициализации БД...');
    
    // Таблица users (основная)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT UNIQUE NOT NULL,
        name TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        avatar TEXT,
        balance REAL DEFAULT 0,
        reviews_count INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        verified INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        about TEXT,
        location TEXT,
        reports_count INTEGER DEFAULT 0,
        warnings INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        tickets_closed INTEGER DEFAULT 0,
        tickets_rating_sum INTEGER DEFAULT 0,
        tickets_rating_count INTEGER DEFAULT 0,
        messages_count INTEGER DEFAULT 0,
        items_moderated INTEGER DEFAULT 0,
        reports_processed INTEGER DEFAULT 0,
        users_reviewed INTEGER DEFAULT 0,
        admin_actions INTEGER DEFAULT 0,
        successful_deals INTEGER DEFAULT 0,
        hours_online INTEGER DEFAULT 0,
        recruits_count INTEGER DEFAULT 0,
        warnings_issued INTEGER DEFAULT 0,
        bans_issued INTEGER DEFAULT 0,
        tickets_resolved_urgent INTEGER DEFAULT 0,
        trainings_completed INTEGER DEFAULT 0,
        events_held INTEGER DEFAULT 0,
        conflicts_resolved INTEGER DEFAULT 0,
        features_created INTEGER DEFAULT 0,
        bugs_fixed INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS game_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_name TEXT NOT NULL,
        category_name TEXT NOT NULL,
        category_slug TEXT,
        UNIQUE(game_name, category_name)
    )`);

	db.run(`CREATE TABLE IF NOT EXISTS media_articles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		slug TEXT UNIQUE NOT NULL,
		title TEXT NOT NULL,
		content TEXT NOT NULL,
		tag TEXT DEFAULT 'Новости',
		author_id INTEGER NOT NULL,
		author_name TEXT NOT NULL,
		views INTEGER DEFAULT 0,
		status TEXT DEFAULT 'published',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (author_id) REFERENCES users (id)
	)`);

    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER NOT NULL,
        game_name TEXT NOT NULL,
        category_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        old_price REAL,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'active',
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (seller_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        category TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_user_id INTEGER NOT NULL,
        from_user_id INTEGER NOT NULL,
        rating INTEGER DEFAULT 5,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (to_user_id) REFERENCES users (id),
        FOREIGN KEY (from_user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        department TEXT NOT NULL,
        subcategory TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        order_number TEXT,
        resolved_by INTEGER,
        resolved_at DATETIME,
        rating INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (resolved_by) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ticket_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        is_staff INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        details TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS promocodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        discount_type TEXT DEFAULT 'percent',
        discount_value REAL NOT NULL,
        max_uses INTEGER,
        used_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS balance_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        last_message TEXT,
        last_message_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        user1_unread INTEGER DEFAULT 0,
        user2_unread INTEGER DEFAULT 0,
        user1_deleted INTEGER DEFAULT 0,
        user2_deleted INTEGER DEFAULT 0,
        item_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user1_id) REFERENCES users (id),
        FOREIGN KEY (user2_id) REFERENCES users (id),
        FOREIGN KEY (item_id) REFERENCES items (id),
        UNIQUE(user1_id, user2_id, item_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        read_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats (id),
        FOREIGN KEY (sender_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS career_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        job_title TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        resume TEXT,
        cover TEXT,
        user_id INTEGER,
        status TEXT DEFAULT 'new',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS message_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        reported_user_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        comment TEXT,
        status TEXT DEFAULT 'pending',
        admin_note TEXT,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id) REFERENCES users (id),
        FOREIGN KEY (reported_user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS blocked_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        blocked_user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (blocked_user_id) REFERENCES users (id),
        UNIQUE(user_id, blocked_user_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS promotion_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        current_role TEXT NOT NULL,
        desired_role TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        reviewed_by INTEGER,
        reviewed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (reviewed_by) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ticket_ratings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS achievement_collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        icon_svg TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        collection_id INTEGER NOT NULL,
        icon_svg TEXT,
        icon_color TEXT DEFAULT '#4f46e5',
        points_reward INTEGER DEFAULT 0,
        requirement_type TEXT NOT NULL,
        requirement_value INTEGER NOT NULL,
        rarity TEXT DEFAULT 'common',
        is_hidden INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (collection_id) REFERENCES achievement_collections (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        progress INTEGER DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        is_featured INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (achievement_id) REFERENCES achievements (id),
        UNIQUE(user_id, achievement_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        admin_name TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS platform_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS collaborations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        type TEXT DEFAULT 'other',
        message TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bug_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_number TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        steps_to_reproduce TEXT,
        actual_result TEXT,
        expected_result TEXT,
        priority TEXT DEFAULT 'medium',
        status TEXT DEFAULT 'open',
        issue_type TEXT,
        product_id INTEGER,
        product_version TEXT,
        platform TEXT,
        tags TEXT,
        attachments TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        resolved_by INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (resolved_by) REFERENCES users (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS test_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        preconditions TEXT,
        steps TEXT NOT NULL,
        expected_result TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'medium',
        product_id INTEGER,
        author_id INTEGER NOT NULL,
        assigned_to INTEGER,
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_run DATETIME,
        FOREIGN KEY (author_id) REFERENCES users (id),
        FOREIGN KEY (assigned_to) REFERENCES users (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS checklists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        items TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        product_id INTEGER,
        author_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        FOREIGN KEY (author_id) REFERENCES users (id),
        FOREIGN KEY (product_id) REFERENCES products (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        version TEXT NOT NULL,
        status TEXT DEFAULT 'beta',
        owner_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users (id)
    )`);

	db.run(`CREATE TABLE IF NOT EXISTS departments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		head_id INTEGER,
		head_name TEXT,
		description TEXT,
		staff_count INTEGER DEFAULT 0,
		tickets_resolved INTEGER DEFAULT 0,
		rating REAL DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (head_id) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS kpis (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		department_id INTEGER,
		name TEXT NOT NULL,
		value TEXT,
		target TEXT,
		status TEXT DEFAULT 'success',
		trend TEXT DEFAULT 'up',
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (department_id) REFERENCES departments (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS strategic_goals (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		description TEXT,
		progress INTEGER DEFAULT 0,
		deadline DATE,
		status TEXT DEFAULT 'pending',
		department_id INTEGER,
		created_by INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (department_id) REFERENCES departments (id),
		FOREIGN KEY (created_by) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS vacations (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		user_name TEXT NOT NULL,
		department_id INTEGER,
		start_date DATE NOT NULL,
		end_date DATE NOT NULL,
		status TEXT DEFAULT 'pending',
		approved_by INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users (id),
		FOREIGN KEY (department_id) REFERENCES departments (id),
		FOREIGN KEY (approved_by) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS reports (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		content TEXT,
		type TEXT DEFAULT 'quarterly',
		author_id INTEGER NOT NULL,
		author_name TEXT,
		status TEXT DEFAULT 'draft',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (author_id) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS vlad_promocodes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT UNIQUE NOT NULL,
		type TEXT NOT NULL,
		value REAL NOT NULL,
		uses INTEGER DEFAULT 0,
		max_uses INTEGER,
		created_by TEXT,
		status TEXT DEFAULT 'pending',
		expires DATETIME,
		created_by_user INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by_user) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS vlad_submissions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		type TEXT NOT NULL,
		author TEXT,
		status TEXT DEFAULT 'pending',
		created_by INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users (id)
	)`);

    db.run(`CREATE TABLE IF NOT EXISTS beta_testers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        role TEXT DEFAULT 'tester',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        reports_count INTEGER DEFAULT 0,
        test_cases_passed INTEGER DEFAULT 0,
        test_cases_failed INTEGER DEFAULT 0,
        rating REAL DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_case_id INTEGER NOT NULL,
        executed_by INTEGER NOT NULL,
        status TEXT NOT NULL,
        comment TEXT,
        screenshot TEXT,
        execution_time INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (test_case_id) REFERENCES test_cases (id),
        FOREIGN KEY (executed_by) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS report_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        comment TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES bug_reports (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS report_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filesize INTEGER,
        uploaded_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES bug_reports (id),
        FOREIGN KEY (uploaded_by) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS report_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        device_type TEXT,
        device_os TEXT,
        browser TEXT,
        screen_resolution TEXT,
        FOREIGN KEY (report_id) REFERENCES bug_reports (id)
    )`);

	db.run(`CREATE TABLE IF NOT EXISTS available_icons (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		role_key TEXT UNIQUE NOT NULL,
		display_name TEXT NOT NULL,
		icon_url TEXT,
		color TEXT DEFAULT '#5865F2',
		description TEXT,
		category TEXT DEFAULT 'Статус',
		can_assign TEXT DEFAULT 'admin'
	)`);

	// Таблица значков пользователей
	db.run(`CREATE TABLE IF NOT EXISTS user_icons (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		role_key TEXT NOT NULL,
		assigned_by INTEGER,
		assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		expires_at DATETIME,
		is_active INTEGER DEFAULT 1,
		FOREIGN KEY (user_id) REFERENCES users (id),
		FOREIGN KEY (assigned_by) REFERENCES users (id),
		UNIQUE(user_id, role_key)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		order_number TEXT UNIQUE NOT NULL,
		item_id INTEGER NOT NULL,
		buyer_id INTEGER NOT NULL,
		seller_id INTEGER NOT NULL,
		status TEXT DEFAULT 'pending',
		price REAL NOT NULL,
		credentials TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		closed_at DATETIME,
		confirmed_at DATETIME,
		refunded_at DATETIME,
		FOREIGN KEY (item_id) REFERENCES items (id),    
		FOREIGN KEY (buyer_id) REFERENCES users (id),
		FOREIGN KEY (seller_id) REFERENCES users (id)
	)`);

	db.run(`CREATE TABLE IF NOT EXISTS order_history (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		order_number TEXT NOT NULL,
		text TEXT NOT NULL,
		from_user TEXT DEFAULT 'system',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (order_number) REFERENCES orders (order_number)
	)`);

	db.get(`SELECT id FROM users WHERE user_id = '00000000'`, (err, row) => {
		if (!row) {
			const systemPassword = '0000000000000000000000000000000000000000'; // 40 символов
			bcrypt.hash(systemPassword, 10, (err, hash) => {
				if (err) {
					console.error('Ошибка хеширования пароля системного аккаунта:', err);
					return;
				}
				db.run(`
					INSERT INTO users (
						user_id, name, email, phone, password_hash, avatar, 
						role, verified, status, about, 
						created_at, reviews_count, tickets_rating_sum, tickets_rating_count
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`, [
					'00000000',
					'NullMarket',
					'systemaccounter@nullmarket.com',
					null,
					hash,
					'/assets/nullmarket-avatar.png',
					'board_of_directors',
					19,  // verified = 19 (максимальный уровень верификации)
					'active',
					'Системный аккаунт NULLMARKET\n\nЭтот аккаунт используется для автоматических уведомлений и приветствий новых пользователей.\n\nОтвечать на сообщения этого аккаунта невозможно.',
					'2025-01-29 00:00:00',
					0,
					0,
					0
				], function(err) {
					if (err) {
						console.error('Ошибка создания системного аккаунта:', err);
					} else {
						console.log('✅ Системный аккаунт NullMarket создан (ID: 00000000)');
						console.log('📅 Дата регистрации: 29 января 2025');
						console.log('⭐ Рейтинг: 4.9 (500+ отзывов)');
					}
				});
			});
		} else {
			console.log('✅ Системный аккаунт NullMarket уже существует');
			
			// Обновляем существующий аккаунт, если нужно
			db.run(`
				UPDATE users SET 
					created_at = '2025-01-29 00:00:00',
					reviews_count = 500,
					tickets_rating_sum = 2450,
					tickets_rating_count = 500,
					about = 'Системный аккаунт NULLMARKET\n\nЭтот аккаунт используется для автоматических уведомлений и приветствий новых пользователей.\n\nОтвечать на сообщения этого аккаунта невозможно.'
				WHERE user_id = '00000000'
			`, (err) => {
				if (!err) {
					console.log('✅ Данные системного аккаунта обновлены');
				}
			});
		}
	});
	
	db.run(`DROP TABLE IF EXISTS orders`, (err) => {
		if (!err) console.log('🗑️ Старая таблица orders удалена');
	});

	db.run(`DROP TABLE IF EXISTS order_history`, (err) => {
		if (!err) console.log('🗑️ Старая таблица order_history удалена');
	});

	// Создаём новые таблицы
	db.run(`
		CREATE TABLE IF NOT EXISTS orders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			order_number TEXT UNIQUE NOT NULL,
			item_id INTEGER NOT NULL,
			buyer_id INTEGER NOT NULL,
			seller_id INTEGER NOT NULL,
			status TEXT DEFAULT 'pending',
			price REAL NOT NULL,
			credentials TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			closed_at DATETIME,
			confirmed_at DATETIME,
			refunded_at DATETIME,
			FOREIGN KEY (item_id) REFERENCES items (id),
			FOREIGN KEY (buyer_id) REFERENCES users (id),
			FOREIGN KEY (seller_id) REFERENCES users (id)
		)
	`, (err) => {
		if (err) {
			console.error('❌ Ошибка создания orders:', err.message);
		} else {
			console.log('✅ Таблица orders создана');
		}
	});

	db.run(`
		CREATE TABLE IF NOT EXISTS order_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			order_number TEXT NOT NULL,
			text TEXT NOT NULL,
			from_user TEXT DEFAULT 'system',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (order_number) REFERENCES orders (order_number)
		)
	`, (err) => {
		if (err) {
			console.error('❌ Ошибка создания order_history:', err.message);
		} else {
			console.log('✅ Таблица order_history создана');
		}
	});
	
	
	db.all(`PRAGMA table_info(orders)`, (err, columns) => {
		if (err) {
			console.error('❌ Ошибка проверки таблицы orders:', err);
			return;
		}

		// Проверяем, есть ли колонка order_number
		const hasOrderNumber = columns.some(col => col.name === 'order_number');
		const hasStatus = columns.some(col => col.name === 'status');

		if (!hasOrderNumber || !hasStatus) {
			console.log('⚠️ Таблица orders имеет неправильную структуру. Пересоздаём...');
			
			// Пересоздаём таблицу с правильной структурой
			db.run(`DROP TABLE IF EXISTS orders_backup`, () => {
				db.run(`DROP TABLE IF EXISTS orders`, () => {
					db.run(`
						CREATE TABLE orders (
							id INTEGER PRIMARY KEY AUTOINCREMENT,
							order_number TEXT UNIQUE NOT NULL,
							item_id INTEGER NOT NULL,
							buyer_id INTEGER NOT NULL,
							seller_id INTEGER NOT NULL,
							status TEXT DEFAULT 'pending',
							price REAL NOT NULL,
							credentials TEXT,
							created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
							closed_at DATETIME,
							confirmed_at DATETIME,
							refunded_at DATETIME,
							FOREIGN KEY (item_id) REFERENCES items (id),
							FOREIGN KEY (buyer_id) REFERENCES users (id),
							FOREIGN KEY (seller_id) REFERENCES users (id)
						)
					`, (err) => {
						if (err) {
							console.error('❌ Ошибка создания таблицы orders:', err);
						} else {
							console.log('✅ Таблица orders пересоздана с правильной структурой');
							
							// Проверяем table_info
							db.all(`PRAGMA table_info(orders)`, (err, info) => {
								if (!err) {
									console.log('📊 Структура orders:', info.map(c => c.name).join(', '));
								}
							});
						}
					});
				});
			});
		} else {
			console.log('✅ Таблица orders имеет правильную структуру');
		}
	});

	// Проверяем таблицу order_history
	db.all(`PRAGMA table_info(order_history)`, (err, columns) => {
		if (err || !columns || columns.length === 0) {
			console.log('⚠️ Таблица order_history отсутствует. Создаём...');
			db.run(`
				CREATE TABLE IF NOT EXISTS order_history (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					order_number TEXT NOT NULL,
					text TEXT NOT NULL,
					from_user TEXT DEFAULT 'system',
					created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					FOREIGN KEY (order_number) REFERENCES orders (order_number)
				)
			`, (err) => {
				if (err) {
					console.error('❌ Ошибка создания order_history:', err);
				} else {
					console.log('✅ Таблица order_history создана');
				}
			});
		} else {
			console.log('✅ Таблица order_history уже существует');
		}
	});

    // Добавляем недостающие колонки
    const statsColumns = ['tickets_closed', 'tickets_rating_sum', 'tickets_rating_count', 'messages_count',
        'items_moderated', 'reports_processed', 'users_reviewed', 'admin_actions', 'successful_deals',
        'hours_online', 'recruits_count', 'warnings_issued', 'bans_issued', 'tickets_resolved_urgent',
        'trainings_completed', 'events_held', 'conflicts_resolved', 'features_created', 'bugs_fixed'];
    statsColumns.forEach(col => addColumnIfNotExists('users', col, 'INTEGER DEFAULT 0'));
	addColumnIfNotExists('users', 'points_balance', 'INTEGER DEFAULT 0');
    addColumnIfNotExists('tickets', 'resolved_by', 'INTEGER');
    addColumnIfNotExists('tickets', 'resolved_at', 'DATETIME');
    addColumnIfNotExists('tickets', 'rating', 'INTEGER');
    addColumnIfNotExists('admin_logs', 'admin_name', 'TEXT');
	addColumnIfNotExists('admin_logs', 'target_user_id', 'INTEGER');

    // Инициализация настроек платформы
    const defaultSettings = [
        { key: 'platformFee', value: '5' }, { key: 'minWithdraw', value: '100' },
        { key: 'adminEmail', value: 'admin@nullmarket.com' }, { key: 'siteName', value: 'NULLMARKET' },
        { key: 'siteDescription', value: 'Маркетплейс цифровых товаров' }, { key: 'maxSelfPromoteRole', value: 'junior_admin' }
    ];
    defaultSettings.forEach(setting => {
        db.get(`SELECT * FROM platform_settings WHERE setting_key = ?`, [setting.key], (err, row) => {
            if (!row) db.run(`INSERT INTO platform_settings (setting_key, setting_value) VALUES (?, ?)`, [setting.key, setting.value]);
        });
    });
    
    // Загрузка категорий
    setTimeout(() => {
        initDepartments();
		loadFunPayCategories();
    }, 200);
    setTimeout(initAvailableIcons, 500);
    // Создание демо продуктов
    db.get(`SELECT COUNT(*) as count FROM products`, (err, row) => {
        if (row && row.count === 0) {
            const demoProducts = [
                { name: 'NULLMARKET Core', version: '2.1.0', status: 'active' },
                { name: 'NULLMARKET Mobile', version: '1.5.2', status: 'beta' },
                { name: 'NULLMARKET API', version: '3.0.0', status: 'active' },
                { name: 'NULLMARKET Admin Panel', version: '1.0.0', status: 'beta' }
            ];
            demoProducts.forEach(p => {
                db.run(`INSERT INTO products (name, version, status) VALUES (?, ?, ?)`, [p.name, p.version, p.status]);
            });
            console.log('Демо продукты созданы');
        }
    });
    
    // Запускаем инициализацию достижений
    initAchievements();
	
    
    console.log('База данных инициализирована');
}

function addOrderHistory(orderNumber, text, fromUser = 'system') {
    db.run(
        `INSERT INTO order_history (order_number, text, from_user) VALUES (?, ?, ?)`,
        [orderNumber, text, fromUser],
        (err) => {
            if (err) console.error('❌ Ошибка записи истории:', err.message);
        }
    );
}

function loadFunPayCategories() {
    db.get("SELECT COUNT(*) as count FROM game_categories", (err, row) => {
        if (err || (row && row.count > 0)) return;
        
        const gamesData = [
            { game: "World of Warcraft", categories: ["Голды, товары", "Аккаунты", "Буст, PvE", "Буст, PvP", "Другое"] },
            { game: "Genshin Impact", categories: ["Аккаунты", "Подарочные камни", "Другое"] },
            { game: "Roblox", categories: ["Robux", "Аккаунты", "Одежда", "Другое"] },
            { game: "Fortnite", categories: ["В-баксы", "Аккаунты", "Скины", "Другое"] },
            { game: "Counter-Strike 2", categories: ["Скины", "Аккаунты", "Прайм", "Другое"] },
            { game: "Dota 2", categories: ["Арканы", "Аккаунты", "Буст", "Другое"] },
            { game: "Minecraft", categories: ["Аккаунты", "Донат", "Постройки", "Другое"] },
            { game: "Steam", categories: ["Игры, ключи", "Аккаунты", "Подарки", "Другое"] },
            { game: "Подписки", categories: ["Netflix", "Spotify", "YouTube Premium", "Discord Nitro", "Telegram Premium", "Другое"] },
            { game: "Софт и лицензии", categories: ["Windows", "Office", "Adobe", "Антивирусы", "VPN", "Другое"] }
        ];
        
        gamesData.forEach(game => {
            game.categories.forEach(category => {
                db.run(`INSERT OR IGNORE INTO game_categories (game_name, category_name) VALUES (?, ?)`, [game.game, category]);
            });
        });
        console.log('Категории загружены');
    });
}



// ============ ИНИЦИАЛИЗАЦИЯ ДОСТИЖЕНИЙ ============
function initAchievements() {
    console.log('📊 Запуск инициализации достижений...');
    
    // Создаём таблицу achievements, если её нет
    db.run(`
        CREATE TABLE IF NOT EXISTS achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            collection_id INTEGER,
            icon_svg TEXT,
            icon_color TEXT,
            points_reward INTEGER DEFAULT 0,
            requirement_type TEXT,
            requirement_value INTEGER,
            rarity TEXT DEFAULT 'common',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (collection_id) REFERENCES achievement_collections(id)
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка создания таблицы achievements:', err.message);
            return;
        }
        console.log('✅ Таблица achievements проверена/создана');
        
        db.get(`SELECT COUNT(*) as count FROM achievements`, (err, row) => {
            if (err) {
                console.error('❌ Ошибка проверки достижений:', err.message);
                return;
            }
            
            if (row && row.count > 0) {
                console.log(`📊 Достижения уже существуют (${row.count} шт.)`);
                return;
            }
            
            createCollections();
        });
    });
    
    const collections = [
        { code: "welcome", name: "Добро пожаловать", description: "Первые шаги на платформе", icon_svg: "M5 13l4 4L19 7", sort_order: 1 },
        { code: "profile", name: "Профиль", description: "Оформление и настройка профиля", icon_svg: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", sort_order: 2 },
        { code: "activity", name: "Активность", description: "Ежедневная активность на платформе", icon_svg: "M13 10V3L4 14h7v7l9-11h-7z", sort_order: 3 },
        { code: "purchases", name: "Покупки", description: "Достижения покупателей", icon_svg: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", sort_order: 4 },
        { code: "sales", name: "Продажи", description: "Достижения продавцов", icon_svg: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", sort_order: 5 },
        { code: "reputation", name: "Репутация", description: "Отзывы и доверие", icon_svg: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", sort_order: 6 },
        { code: "collector", name: "Коллекционер", description: "Сбор достижений", icon_svg: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", sort_order: 7 },
        { code: "finance", name: "Финансы", description: "Финансовые достижения", icon_svg: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", sort_order: 8 },
        { code: "veteran", name: "Ветеран", description: "За стаж на платформе", icon_svg: "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", sort_order: 9 },
        { code: "referrals", name: "Приглашения", description: "Приглашай друзей", icon_svg: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", sort_order: 10 },
        { code: "support", name: "Поддержка", description: "Помощь другим пользователям", icon_svg: "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", sort_order: 11 },
        { code: "streak", name: "Серии", description: "Достижения за серии", icon_svg: "M13 10V3L4 14h7v7l9-11h-7z", sort_order: 12 },
        { code: "dnd", name: "Подземелья и драконы", description: "Фэнтези-достижения", icon_svg: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", sort_order: 13 },
        { code: "zodiac", name: "Знаки зодиака", description: "Астрологические достижения", icon_svg: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", sort_order: 14 },
        { code: "rich", name: "Я богат", description: "Достижения для богатых", icon_svg: "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", sort_order: 15 },
        { code: "mavs", name: "Мавс", description: "Коллекция Мавс", icon_svg: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", sort_order: 16 },
        { code: "vktesters", name: "NULLMARKET Testers", description: "Достижения тестеров", icon_svg: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", sort_order: 17 },
        { code: "nocyberbullying", name: "#Неткибербуллингу", description: "Защита от кибербуллинга", icon_svg: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", sort_order: 18 }

    ];
    
    function createCollections() {
        console.log(`📊 Создание ${collections.length} коллекций...`);
        let index = 0;
        let created = 0;
        let skipped = 0;
        
        function createNext() {
            if (index >= collections.length) {
                console.log(`✅ Все ${collections.length} коллекций обработаны (создано: ${created}, пропущено: ${skipped})`);
                db.get(`SELECT COUNT(*) as count FROM achievement_collections`, (err, row) => {
                    console.log(`📊 В БД коллекций: ${row?.count || 0}`);
                    if (row && row.count > 0) {
                        createAchievements();
                    } else {
                        console.error('❌ Нет коллекций в БД!');
                    }
                });
                return;
            }
            
            const col = collections[index];
            db.run(`
                INSERT OR IGNORE INTO achievement_collections (code, name, description, icon_svg, sort_order)
                VALUES (?, ?, ?, ?, ?)
            `, [col.code, col.name, col.description, col.icon_svg, col.sort_order], function(err) {
                if (err) {
                    console.error(`❌ Ошибка создания коллекции ${col.code}:`, err.message);
                } else if (this.changes > 0) {
                    created++;
                } else {
                    skipped++;
                }
                index++;
                setTimeout(createNext, 2);
            });
        }
        
        createNext();
    }
    
    function createAchievements() {
        console.log('📊 Начинаем создание достижений...');
        
        db.all(`SELECT id, code FROM achievement_collections`, (err, collectionsMap) => {
            if (err) {
                console.error('❌ Ошибка получения коллекций:', err);
                return;
            }
            
            const colMap = {};
            (collectionsMap || []).forEach(c => { colMap[c.code] = c.id; });
            console.log('📊 Коллекций для привязки:', Object.keys(colMap).length);
            
            if (Object.keys(colMap).length === 0) {
                console.error('❌ Нет коллекций! Невозможно добавить достижения.');
                return;
            }
            
            const achievementsList = [];
            
            function addAch(code, name, desc, collection, icon, color, points, type, value, rarity) {
                achievementsList.push({ code, name, desc, collection, icon, color, points, type, value, rarity });
            }
            
            // ============================================================
            // 1. ДОБРО ПОЖАЛОВАТЬ (10)
            // ============================================================
            addAch("WELCOME", "Добро пожаловать!", "Зарегистрироваться на платформе", "welcome", "M5 13l4 4L19 7", "#10b981", 50, "registered", 1, "common");
            addAch("EMAIL_CONFIRM", "Подтверждённая почта", "Подтвердить email", "welcome", "M3 8l7.89 5.26a2 2 0 002.22 0L21 8", "#3b82f6", 50, "email_confirmed", 1, "common");
            addAch("PHONE_VERIFY", "Номер подтверждён", "Привязать и подтвердить номер телефона", "welcome", "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z", "#22c55e", 50, "phone_verified", 1, "common");
            addAch("TERMS_ACCEPT", "Правила приняты", "Принять условия использования", "welcome", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 25, "terms_accepted", 1, "common");
            addAch("FIRST_LOGIN", "Первый вход", "Войти в аккаунт после регистрации", "welcome", "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1", "#6366f1", 25, "first_login", 1, "common");
            addAch("AVATAR_UPLOAD", "Аватар загружен", "Загрузить аватар", "welcome", "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", "#8b5cf6", 30, "avatar_set", 1, "common");
            addAch("BIO_WRITTEN", "О себе написано", "Написать о себе", "welcome", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#6b7280", 25, "bio_filled", 1, "common");
            addAch("FIRST_DAY", "Первый день", "Провести первый день на платформе", "welcome", "M13 10V3L4 14h7v7l9-11h-7z", "#f59e0b", 15, "days_on_platform", 1, "common");
            addAch("WEEK_ONE", "Первая неделя", "Провести неделю на платформе", "welcome", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f59e0b", 50, "days_on_platform", 7, "common");
            addAch("MONTH_ONE", "Первый месяц", "Провести месяц на платформе", "welcome", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f97316", 100, "days_on_platform", 30, "rare");
            
            // ============================================================
            // 2. ПРОФИЛЬ (15)
            // ============================================================
            addAch("PROFILE_COMPLETE", "Профиль завершён", "Заполнить профиль на 100%", "profile", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 150, "profile_complete", 1, "rare");
            addAch("SOCIAL_LINKED", "Социальные сети", "Привязать соцсети к профилю", "profile", "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3V2z", "#1d9bf0", 100, "social_linked", 1, "rare");
            addAch("PROFILE_VIEWS_100", "100 просмотров", "Получить 100 просмотров профиля", "profile", "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", "#8b5cf6", 50, "profile_views", 100, "common");
            addAch("PROFILE_VIEWS_1000", "1000 просмотров", "Получить 1000 просмотров профиля", "profile", "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", "#8b5cf6", 200, "profile_views", 1000, "epic");
            addAch("PROFILE_VIEWS_10000", "10 000 просмотров", "Получить 10000 просмотров профиля", "profile", "M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z", "#f59e0b", 500, "profile_views", 10000, "legendary");
            addAch("PROFILE_VERIFIED", "Верифицирован", "Получить верификацию профиля", "profile", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#3b82f6", 300, "verified", 1, "epic");
            addAch("FOLLOWERS_10", "10 подписчиков", "Набрать 10 подписчиков", "profile", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#8b5cf6", 50, "followers", 10, "common");
            addAch("FOLLOWERS_100", "100 подписчиков", "Набрать 100 подписчиков", "profile", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#8b5cf6", 150, "followers", 100, "rare");
            addAch("FOLLOWERS_1000", "1000 подписчиков", "Набрать 1000 подписчиков", "profile", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#f59e0b", 500, "followers", 1000, "epic");
            addAch("FOLLOWERS_10000", "10 000 подписчиков", "Набрать 10000 подписчиков", "profile", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ef4444", 2000, "followers", 10000, "legendary");
            addAch("LOCATION_SET", "Геолокация", "Установить геолокацию", "profile", "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z", "#10b981", 25, "location_set", 1, "common");
            addAch("BIRTHDAY_SET", "День рождения", "Указать день рождения", "profile", "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z", "#f59e0b", 25, "birthday_set", 1, "common");
            addAch("INTERESTS_SET", "Интересы", "Указать интересы", "profile", "M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm4 4h8M8 10v4m4-4v4", "#8b5cf6", 30, "interests_set", 1, "common");
            
            // ============================================================
            // 3. АКТИВНОСТЬ (20)
            // ============================================================
            addAch("LOGIN_7", "7 дней подряд", "Заходить на платформу 7 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#f59e0b", 100, "login_streak", 7, "rare");
            addAch("LOGIN_14", "14 дней подряд", "Заходить на платформу 14 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#f59e0b", 200, "login_streak", 14, "rare");
            addAch("LOGIN_30", "30 дней подряд", "Заходить на платформу 30 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#f97316", 500, "login_streak", 30, "epic");
            addAch("LOGIN_60", "60 дней подряд", "Заходить на платформу 60 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#f97316", 800, "login_streak", 60, "epic");
            addAch("LOGIN_100", "100 дней подряд", "Заходить на платформу 100 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#ef4444", 1500, "login_streak", 100, "legendary");
            addAch("LOGIN_180", "180 дней подряд", "Заходить на платформу 180 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#ef4444", 2000, "login_streak", 180, "legendary");
            addAch("LOGIN_365", "Год подряд!", "Заходить на платформу 365 дней подряд", "activity", "M13 10V3L4 14h7v7l9-11h-7z", "#ec4899", 5000, "login_streak", 365, "mythic");
            addAch("ACTIVE_HOURS_10", "10 часов", "Провести 10 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#6b7280", 10, "time_spent_hours", 10, "common");
            addAch("ACTIVE_HOURS_50", "50 часов", "Провести 50 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#3b82f6", 50, "time_spent_hours", 50, "common");
            addAch("ACTIVE_HOURS_100", "100 часов", "Провести 100 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#8b5cf6", 100, "time_spent_hours", 100, "rare");
            addAch("ACTIVE_HOURS_500", "500 часов", "Провести 500 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f59e0b", 300, "time_spent_hours", 500, "epic");
            addAch("ACTIVE_HOURS_1000", "1000 часов", "Провести 1000 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f97316", 800, "time_spent_hours", 1000, "epic");
            addAch("ACTIVE_HOURS_5000", "5000 часов", "Провести 5000 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ef4444", 3000, "time_spent_hours", 5000, "legendary");
            addAch("ACTIVE_HOURS_10000", "10 000 часов!", "Провести 10000 часов на платформе", "activity", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ec4899", 10000, "time_spent_hours", 10000, "mythic");
            addAch("POSTS_10", "10 записей", "Создать 10 записей", "activity", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 50, "posts_count", 10, "common");
            addAch("POSTS_100", "100 записей", "Создать 100 записей", "activity", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 200, "posts_count", 100, "rare");
            addAch("POSTS_1000", "1000 записей", "Создать 1000 записей", "activity", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#f59e0b", 1000, "posts_count", 1000, "epic");
            addAch("LIKES_10", "10 лайков", "Получить 10 лайков", "activity", "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", "#f43f5e", 25, "likes_received", 10, "common");
            addAch("LIKES_100", "100 лайков", "Получить 100 лайков", "activity", "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", "#f43f5e", 100, "likes_received", 100, "rare");
            addAch("LIKES_1000", "1000 лайков", "Получить 1000 лайков", "activity", "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", "#f43f5e", 500, "likes_received", 1000, "epic");
            
            // ============================================================
            // 4. ПОКУПКИ (15)
            // ============================================================
            addAch("FIRST_PURCHASE", "Первая покупка", "Совершить первую покупку", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f59e0b", 100, "purchases_count", 1, "rare");
            addAch("PURCHASES_5", "5 покупок", "Совершить 5 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f59e0b", 150, "purchases_count", 5, "rare");
            addAch("PURCHASES_10", "10 покупок", "Совершить 10 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f59e0b", 200, "purchases_count", 10, "rare");
            addAch("PURCHASES_25", "25 покупок", "Совершить 25 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f97316", 300, "purchases_count", 25, "rare");
            addAch("PURCHASES_50", "50 покупок", "Совершить 50 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f97316", 400, "purchases_count", 50, "epic");
            addAch("PURCHASES_100", "100 покупок", "Совершить 100 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#f97316", 500, "purchases_count", 100, "epic");
            addAch("PURCHASES_250", "250 покупок", "Совершить 250 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#ef4444", 800, "purchases_count", 250, "epic");
            addAch("PURCHASES_500", "500 покупок", "Совершить 500 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#ef4444", 1500, "purchases_count", 500, "legendary");
            addAch("PURCHASES_1000", "1000 покупок", "Совершить 1000 покупок", "purchases", "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 6M17 13l1.5 6M9 21h6M12 15v6", "#ef4444", 2000, "purchases_count", 1000, "legendary");
            addAch("SPENT_1000", "1000 потрачено", "Потратить 1000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 50, "purchase_amount", 1000, "common");
            addAch("SPENT_5000", "5000 потрачено", "Потратить 5000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 100, "purchase_amount", 5000, "rare");
            addAch("SPENT_10000", "10000 потрачено", "Потратить 10000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 200, "purchase_amount", 10000, "rare");
            addAch("SPENT_50000", "50000 потрачено", "Потратить 50000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 500, "purchase_amount", 50000, "epic");
            addAch("SPENT_100000", "100000 потрачено", "Потратить 100000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 1000, "purchase_amount", 100000, "legendary");
            addAch("SPENT_500000", "500000 потрачено", "Потратить 500000 ₽ на покупки", "purchases", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 3000, "purchase_amount", 500000, "legendary");
            
            // ============================================================
            // 5. ПРОДАЖИ (15)
            // ============================================================
            addAch("FIRST_SALE", "Первая продажа", "Продать первый товар", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 100, "sales_count", 1, "rare");
            addAch("SALES_5", "5 продаж", "Продать 5 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 150, "sales_count", 5, "rare");
            addAch("SALES_10", "10 продаж", "Продать 10 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 250, "sales_count", 10, "rare");
            addAch("SALES_25", "25 продаж", "Продать 25 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 350, "sales_count", 25, "rare");
            addAch("SALES_50", "50 продаж", "Продать 50 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 450, "sales_count", 50, "epic");
            addAch("SALES_100", "100 продаж", "Продать 100 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 600, "sales_count", 100, "epic");
            addAch("SALES_250", "250 продаж", "Продать 250 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 1000, "sales_count", 250, "epic");
            addAch("SALES_500", "500 продаж", "Продать 500 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 1500, "sales_count", 500, "legendary");
            addAch("SALES_1000", "1000 продаж", "Продать 1000 товаров", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 2000, "sales_count", 1000, "legendary");
            addAch("EARNED_1000", "1000 заработано", "Заработать 1000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 50, "sale_amount", 1000, "common");
            addAch("EARNED_5000", "5000 заработано", "Заработать 5000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 100, "sale_amount", 5000, "rare");
            addAch("EARNED_10000", "10000 заработано", "Заработать 10000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 200, "sale_amount", 10000, "rare");
            addAch("EARNED_50000", "50000 заработано", "Заработать 50000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 500, "sale_amount", 50000, "epic");
            addAch("EARNED_100000", "100000 заработано", "Заработать 100000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 1000, "sale_amount", 100000, "legendary");
            addAch("EARNED_500000", "500000 заработано", "Заработать 500000 ₽ на продажах", "sales", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 3000, "sale_amount", 500000, "legendary");
            
            // ============================================================
            // 6. РЕПУТАЦИЯ (15)
            // ============================================================
            addAch("FIRST_REVIEW", "Первый отзыв", "Получить первый отзыв", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#f59e0b", 50, "reviews_received", 1, "common");
            addAch("REVIEWS_5", "5 отзывов", "Получить 5 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#f59e0b", 80, "reviews_received", 5, "common");
            addAch("REVIEWS_10", "10 отзывов", "Получить 10 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#f59e0b", 150, "reviews_received", 10, "rare");
            addAch("REVIEWS_25", "25 отзывов", "Получить 25 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#8b5cf6", 250, "reviews_received", 25, "rare");
            addAch("REVIEWS_50", "50 отзывов", "Получить 50 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#8b5cf6", 400, "reviews_received", 50, "epic");
            addAch("REVIEWS_100", "100 отзывов", "Получить 100 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#8b5cf6", 500, "reviews_received", 100, "epic");
            addAch("REVIEWS_250", "250 отзывов", "Получить 250 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#f59e0b", 1000, "reviews_received", 250, "legendary");
            addAch("REVIEWS_500", "500 отзывов", "Получить 500 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#ef4444", 2000, "reviews_received", 500, "legendary");
            addAch("REVIEWS_1000", "1000 отзывов", "Получить 1000 отзывов", "reputation", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#ec4899", 5000, "reviews_received", 1000, "mythic");
            addAch("POSITIVE_80", "80% положительных", "Достичь 80% положительных отзывов", "reputation", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 300, "positive_reviews_percent", 80, "rare");
            addAch("POSITIVE_90", "90% положительных", "Достичь 90% положительных отзывов", "reputation", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 500, "positive_reviews_percent", 90, "epic");
            addAch("POSITIVE_95", "95% положительных", "Достичь 95% положительных отзывов", "reputation", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#22c55e", 1000, "positive_reviews_percent", 95, "epic");
            addAch("POSITIVE_98", "98% положительных", "Достичь 98% положительных отзывов", "reputation", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 2000, "positive_reviews_percent", 98, "legendary");
            addAch("POSITIVE_99", "99% положительных", "Достичь 99% положительных отзывов", "reputation", "M9 12l2 2 4-4m6 4a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 3000, "positive_reviews_percent", 99, "legendary");
            
            // ============================================================
            // 7. КОЛЛЕКЦИОНЕР (10)
            // ============================================================
            addAch("COLLECT_5", "Новичок-коллекционер", "Разблокировать 5 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 100, "achievements_count", 5, "common");
            addAch("COLLECT_10", "Начинающий коллекционер", "Разблокировать 10 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 200, "achievements_count", 10, "common");
            addAch("COLLECT_25", "Опытный коллекционер", "Разблокировать 25 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 500, "achievements_count", 25, "rare");
            addAch("COLLECT_50", "Продвинутый коллекционер", "Разблокировать 50 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 800, "achievements_count", 50, "rare");
            addAch("COLLECT_100", "Мастер-коллекционер", "Разблокировать 100 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#8b5cf6", 1500, "achievements_count", 100, "epic");
            addAch("COLLECT_150", "Эксперт-коллекционер", "Разблокировать 150 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#f59e0b", 2000, "achievements_count", 150, "epic");
            addAch("COLLECT_250", "Гранд-коллекционер", "Разблокировать 250 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#f59e0b", 3000, "achievements_count", 250, "legendary");
            addAch("COLLECT_500", "Легендарный коллекционер", "Разблокировать 500 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#ef4444", 5000, "achievements_count", 500, "legendary");
            addAch("COLLECT_750", "Архи-коллекционер", "Разблокировать 750 достижений", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#ec4899", 7500, "achievements_count", 750, "mythic");
            addAch("COLLECT_1000", "Абсолютный коллекционер", "Разблокировать 1000 достижений!", "collector", "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10", "#ec4899", 10000, "achievements_count", 1000, "mythic");
            
            // ============================================================
            // 8. ФИНАНСЫ (15)
            // ============================================================
            addAch("BALANCE_100", "100 ₽ на балансе", "Иметь на балансе 100 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 10, "balance_amount", 100, "common");
            addAch("BALANCE_500", "500 ₽ на балансе", "Иметь на балансе 500 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 25, "balance_amount", 500, "common");
            addAch("BALANCE_1000", "1000 ₽ на балансе", "Иметь на балансе 1000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 100, "balance_amount", 1000, "rare");
            addAch("BALANCE_5000", "5000 ₽ на балансе", "Иметь на балансе 5000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 200, "balance_amount", 5000, "rare");
            addAch("BALANCE_10000", "10000 ₽ на балансе", "Иметь на балансе 10000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 500, "balance_amount", 10000, "epic");
            addAch("BALANCE_25000", "25000 ₽ на балансе", "Иметь на балансе 25000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 800, "balance_amount", 25000, "epic");
            addAch("BALANCE_50000", "50000 ₽ на балансе", "Иметь на балансе 50000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 1500, "balance_amount", 50000, "legendary");
            addAch("BALANCE_100000", "100000 ₽ на балансе", "Иметь на балансе 100000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 2000, "balance_amount", 100000, "legendary");
            addAch("BALANCE_500000", "500000 ₽ на балансе", "Иметь на балансе 500000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ec4899", 5000, "balance_amount", 500000, "mythic");
            addAch("BALANCE_1000000", "1 000 000 ₽ на балансе!", "Иметь на балансе 1 000 000 ₽", "finance", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ec4899", 10000, "balance_amount", 1000000, "mythic");
            addAch("FIRST_WITHDRAWAL", "Первый вывод", "Вывести средства впервые", "finance", "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", "#3b82f6", 50, "withdrawal_count", 1, "common");
            addAch("WITHDRAWAL_5", "5 выводов", "Вывести средства 5 раз", "finance", "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", "#3b82f6", 100, "withdrawal_count", 5, "rare");
            addAch("WITHDRAWAL_10", "10 выводов", "Вывести средства 10 раз", "finance", "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", "#8b5cf6", 200, "withdrawal_count", 10, "rare");
            addAch("WITHDRAWAL_25", "25 выводов", "Вывести средства 25 раз", "finance", "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", "#f59e0b", 500, "withdrawal_count", 25, "epic");
            addAch("WITHDRAWAL_50", "50 выводов", "Вывести средства 50 раз", "finance", "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z", "#ef4444", 1000, "withdrawal_count", 50, "legendary");
            
            // ============================================================
            // 9. ВЕТЕРАН (10)
            // ============================================================
            addAch("VETERAN_3M", "3 месяца", "Быть на платформе 3 месяца", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f59e0b", 50, "days_on_platform", 90, "common");
            addAch("VETERAN_6M", "6 месяцев", "Быть на платформе 6 месяцев", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f59e0b", 100, "days_on_platform", 180, "rare");
            addAch("VETERAN_1Y", "1 год", "Быть на платформе 1 год", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f59e0b", 200, "days_on_platform", 365, "rare");
            addAch("VETERAN_1_5Y", "1.5 года", "Быть на платформе 1.5 года", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f97316", 350, "days_on_platform", 548, "rare");
            addAch("VETERAN_2Y", "2 года", "Быть на платформе 2 года", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f97316", 500, "days_on_platform", 730, "epic");
            addAch("VETERAN_3Y", "3 года", "Быть на платформе 3 года", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#f97316", 1000, "days_on_platform", 1095, "epic");
            addAch("VETERAN_4Y", "4 года", "Быть на платформе 4 года", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ef4444", 1500, "days_on_platform", 1460, "legendary");
            addAch("VETERAN_5Y", "5 лет", "Быть на платформе 5 лет", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ef4444", 2000, "days_on_platform", 1825, "legendary");
            addAch("VETERAN_7Y", "7 лет", "Быть на платформе 7 лет", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ec4899", 4000, "days_on_platform", 2555, "mythic");
            addAch("VETERAN_10Y", "10 лет!", "Быть на платформе 10 лет", "veteran", "M12 8v4l3 3M12 2a10 10 0 0110 10M12 2a10 10 0 00-10 10M12 2v20", "#ec4899", 10000, "days_on_platform", 3650, "mythic");
            
            // ============================================================
            // 10. ПРИГЛАШЕНИЯ (10)
            // ============================================================
            addAch("REFERRAL_1", "Пригласил друга", "Пригласить первого друга", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#8b5cf6", 100, "referrals", 1, "rare");
            addAch("REFERRAL_3", "3 друга", "Пригласить 3 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#8b5cf6", 200, "referrals", 3, "rare");
            addAch("REFERRAL_5", "5 друзей", "Пригласить 5 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#f59e0b", 300, "referrals", 5, "rare");
            addAch("REFERRAL_10", "10 друзей", "Пригласить 10 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#f97316", 500, "referrals", 10, "epic");
            addAch("REFERRAL_25", "25 друзей", "Пригласить 25 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#f97316", 800, "referrals", 25, "epic");
            addAch("REFERRAL_50", "50 друзей", "Пригласить 50 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ef4444", 1500, "referrals", 50, "legendary");
            addAch("REFERRAL_100", "100 друзей", "Пригласить 100 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ef4444", 3000, "referrals", 100, "legendary");
            addAch("REFERRAL_250", "250 друзей", "Пригласить 250 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ec4899", 5000, "referrals", 250, "mythic");
            addAch("REFERRAL_500", "500 друзей!", "Пригласить 500 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ec4899", 10000, "referrals", 500, "mythic");
            addAch("REFERRAL_1000", "1000 друзей! Легенда!", "Пригласить 1000 друзей", "referrals", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#ec4899", 25000, "referrals", 1000, "mythic");
            
            // ============================================================
            // 11. ПОДДЕРЖКА (10)
            // ============================================================
            addAch("SUPPORT_1", "Первый тикет", "Создать первый тикет в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#3b82f6", 25, "support_tickets", 1, "common");
            addAch("SUPPORT_5", "5 тикетов", "Создать 5 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#3b82f6", 50, "support_tickets", 5, "common");
            addAch("SUPPORT_10", "10 тикетов", "Создать 10 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#8b5cf6", 100, "support_tickets", 10, "rare");
            addAch("SUPPORT_25", "25 тикетов", "Создать 25 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#8b5cf6", 250, "support_tickets", 25, "rare");
            addAch("SUPPORT_50", "50 тикетов", "Создать 50 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#f59e0b", 500, "support_tickets", 50, "epic");
            addAch("SUPPORT_100", "100 тикетов", "Создать 100 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#f59e0b", 800, "support_tickets", 100, "epic");
            addAch("SUPPORT_200", "200 тикетов", "Создать 200 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#ef4444", 1500, "support_tickets", 200, "legendary");
            addAch("SUPPORT_500", "500 тикетов", "Создать 500 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#ef4444", 3000, "support_tickets", 500, "legendary");
            addAch("SUPPORT_1000", "1000 тикетов", "Создать 1000 тикетов в поддержку", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#ec4899", 5000, "support_tickets", 1000, "mythic");
            addAch("SUPPORT_FAST", "Быстрый ответ", "Ответить на тикет за 5 минут", "support", "M18 9v3m0 0v3m0-3h3m-3 0h-3M3 5h18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z", "#10b981", 200, "support_fast_reply", 1, "rare");
            
            // ============================================================
            // 12. СЕРИИ (10)
            // ============================================================
            addAch("STREAK_3", "3 дня подряд", "Заходить на платформу 3 дня подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#6b7280", 25, "login_streak", 3, "common");
            addAch("STREAK_7", "7 дней подряд", "Заходить на платформу 7 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#3b82f6", 100, "login_streak", 7, "rare");
            addAch("STREAK_14", "14 дней подряд", "Заходить на платформу 14 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#3b82f6", 200, "login_streak", 14, "rare");
            addAch("STREAK_30", "30 дней подряд", "Заходить на платформу 30 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#8b5cf6", 500, "login_streak", 30, "epic");
            addAch("STREAK_60", "60 дней подряд", "Заходить на платформу 60 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#8b5cf6", 800, "login_streak", 60, "epic");
            addAch("STREAK_90", "90 дней подряд", "Заходить на платформу 90 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#f59e0b", 1200, "login_streak", 90, "epic");
            addAch("STREAK_180", "180 дней подряд", "Заходить на платформу 180 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#ef4444", 2000, "login_streak", 180, "legendary");
            addAch("STREAK_270", "270 дней подряд", "Заходить на платформу 270 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#ef4444", 3000, "login_streak", 270, "legendary");
            addAch("STREAK_365", "365 дней подряд!", "Заходить на платформу 365 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#ec4899", 10000, "login_streak", 365, "mythic");
            addAch("STREAK_730", "2 года подряд!", "Заходить на платформу 730 дней подряд", "streak", "M13 10V3L4 14h7v7l9-11h-7z", "#ec4899", 25000, "login_streak", 730, "mythic");
            
            // ============================================================
            // 13. ПОДЗЕМЕЛЬЯ И ДРАКОНЫ (11)
            // ============================================================
            addAch("DND_WIZARD", "Волшебник", "Получить статус Волшебника", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 50, "dnd_wizard", 1, "common");
            addAch("DND_ORC", "Орк", "Получить статус Орка", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 50, "dnd_orc", 1, "common");
            addAch("DND_ROGUE", "Плут", "Получить статус Плута", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#6b7280", 50, "dnd_rogue", 1, "common");
            addAch("DND_WARRIOR", "Воин", "Получить статус Воина", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 50, "dnd_warrior", 1, "common");
            addAch("DND_DRAGONBORN", "Драконорождённый", "Получить статус Драконорождённого", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 50, "dnd_dragonborn", 1, "common");
            addAch("DND_DWARF", "Дварф", "Получить статус Дварфа", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#3b82f6", 50, "dnd_dwarf", 1, "common");
            addAch("DND_ELF", "Эльф", "Получить статус Эльфа", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#10b981", 50, "dnd_elf", 1, "common");
            addAch("DND_HALFLING", "Полурослик", "Получить статус Полурослика", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f59e0b", 50, "dnd_halfling", 1, "common");
            addAch("DND_TIEFLING", "Тифлинг", "Получить статус Тифлинга", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#ef4444", 50, "dnd_tiefling", 1, "common");
            addAch("DND_GNOME", "Гном", "Получить статус Гнома", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#8b5cf6", 50, "dnd_gnome", 1, "common");
            addAch("DND_BARBARIAN", "Варвар", "Получить статус Варвара", "dnd", "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", "#f97316", 50, "dnd_barbarian", 1, "common");
            
            // ============================================================
            // 14. ЗНАКИ ЗОДИАКА (12)
            // ============================================================
            const zodiacs = [
                { code: "ARIES", name: "Овен", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#ef4444" },
                { code: "TAURUS", name: "Телец", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#22c55e" },
                { code: "GEMINI", name: "Близнецы", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#f59e0b" },
                { code: "CANCER", name: "Рак", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#06b6d4" },
                { code: "LEO", name: "Лев", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#f59e0b" },
                { code: "VIRGO", name: "Дева", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#22c55e" },
                { code: "LIBRA", name: "Весы", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#8b5cf6" },
                { code: "SCORPIO", name: "Скорпион", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#ef4444" },
                { code: "SAGITTARIUS", name: "Стрелец", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#8b5cf6" },
                { code: "CAPRICORN", name: "Козерог", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#6b7280" },
                { code: "AQUARIUS", name: "Водолей", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#3b82f6" },
                { code: "PISCES", name: "Рыбы", icon: "M12 3v18M3 12h18M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z", color: "#06b6d4" }
            ];
            zodiacs.forEach(z => {
                addAch(`ZODIAC_${z.code}`, z.name, `Получить статус ${z.name}`, "zodiac", z.icon, z.color, 30, `zodiac_${z.code.toLowerCase()}`, 1, "common");
            });
            
            // ============================================================
            // 15. Я БОГАТ (5)
            // ============================================================
            addAch("RICH_1", "Я богат", "Получить статус 'Я богат'", "rich", "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", "#f59e0b", 100, "rich_status", 1, "rare");
            addAch("RICH_10", "Очень богат", "Получить статус 'Очень богат'", "rich", "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", "#f97316", 200, "rich_status_10", 1, "epic");
            addAch("RICH_100", "Невероятно богат", "Получить статус 'Невероятно богат'", "rich", "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", "#ef4444", 500, "rich_status_100", 1, "legendary");
            addAch("RICH_1000", "Легендарно богат", "Получить статус 'Легендарно богат'", "rich", "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", "#ec4899", 1000, "rich_status_1000", 1, "mythic");
            addAch("RICH_10000", "Миллиардер!", "Получить статус 'Миллиардер'", "rich", "M12 2c-5.523 0-10 4.477-10 10s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z", "#ec4899", 5000, "rich_status_10000", 1, "mythic");
            
            // ============================================================
            // 16. МАВС (9)
            // ============================================================
            addAch("MAVS_LOVE", "Люблю", "Получить статус 'Люблю'", "mavs", "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", "#f43f5e", 25, "mavs_love", 1, "common");
            addAch("MAVS_SIT", "Посижу тут", "Получить статус 'Посижу тут'", "mavs", "M13 10V3L4 14h7v7l9-11h-7z", "#8b5cf6", 25, "mavs_sit", 1, "common");
            addAch("MAVS_HAPPY", "Радуюсь жизни", "Получить статус 'Радуюсь жизни'", "mavs", "M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7", "#f59e0b", 25, "mavs_happy", 1, "common");
            addAch("MAVS_QUESTION", "Только один вопрос", "Получить статус 'Только один вопрос'", "mavs", "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01", "#3b82f6", 25, "mavs_question", 1, "common");
            addAch("MAVS_HELLO", "Приветник", "Получить статус 'Приветник'", "mavs", "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", "#10b981", 25, "mavs_hello", 1, "common");
            addAch("MAVS_FUNNY", "Не смешил меня", "Получить статус 'Не смешил меня'", "mavs", "M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7", "#6b7280", 25, "mavs_funny", 1, "common");
            addAch("MAVS_STAR", "Звезда", "Получить статус 'Звезда'", "mavs", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z", "#f59e0b", 50, "mavs_star", 1, "rare");
            addAch("MAVS_HERO", "Герой", "Получить статус 'Герой'", "mavs", "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", "#ef4444", 100, "mavs_hero", 1, "rare");
            addAch("MAVS_LEGEND", "Легенда", "Получить статус 'Легенда'", "mavs", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#ec4899", 200, "mavs_legend", 1, "epic");
            
            // ============================================================
            // 17. NULLMARKET TESTERS (8)
            // ============================================================
            addAch("NMT_1Y", "Тестирую 1 год", "Тестировать платформу 1 год", "vktesters", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#3b82f6", 50, "nmt_1y", 1, "common");
            addAch("NMT_3Y", "Тестирую 3 года", "Тестировать платформу 3 года", "vktesters", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#8b5cf6", 100, "nmt_3y", 1, "rare");
            addAch("NMT_5Y", "Тестирую 5 лет", "Тестировать платформу 5 лет", "vktesters", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#f59e0b", 200, "nmt_5y", 1, "rare");
            addAch("NMT_7Y", "Тестирую 7 лет", "Тестировать платформу 7 лет", "vktesters", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#f97316", 500, "nmt_7y", 1, "epic");
            addAch("NMT_10Y", "Тестирую 10 лет", "Тестировать платформу 10 лет", "vktesters", "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z", "#ec4899", 1500, "nmt_10y", 1, "legendary");
            addAch("NMT_INVINCIBLE", "Неуязвимый тестер", "Получить статус 'Неуязвимый тестер'", "vktesters", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#10b981", 300, "nmt_invincible", 1, "epic");
            addAch("NMT_GUILDS", "Выбираю гильдии", "Получить статус 'Выбираю гильдии'", "vktesters", "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", "#8b5cf6", 200, "nmt_guilds", 1, "rare");
            
            // ============================================================
            // 18. #НЕТКИБЕРБУЛЛИНГУ (5)
            // ============================================================
            addAch("NCB_ANTITOXIN", "Антитоксин", "Получить статус 'Антитоксин'", "nocyberbullying", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#10b981", 50, "ncb_antitoxin", 1, "common");
            addAch("NCB_AGAINST", "Я против травли", "Получить статус 'Я против травли'", "nocyberbullying", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#3b82f6", 50, "ncb_against", 1, "common");
            addAch("NCB_THINK", "Думаю, что пишу", "Получить статус 'Думаю, что пишу'", "nocyberbullying", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#8b5cf6", 50, "ncb_think", 1, "common");
            addAch("NCB_SPEAK", "Готов выступать", "Получить статус 'Готов выступать'", "nocyberbullying", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#f59e0b", 50, "ncb_speak", 1, "common");
            addAch("NCB_CRY", "Плакать — это нормально", "Получить статус 'Плакать — это нормально'", "nocyberbullying", "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z", "#6b7280", 50, "ncb_cry", 1, "common");
   
            
            console.log(`📊 Всего сгенерировано достижений: ${achievementsList.length}`);
            
            // ===== ПОСЛЕДОВАТЕЛЬНОЕ ДОБАВЛЕНИЕ =====
            let index = 0;
            let added = 0;
            let errors = 0;
            const total = achievementsList.length;
            
            function insertNext() {
                if (index >= total) {
                    console.log(`✅ Все ${total} достижений обработаны (добавлено: ${added}, ошибок: ${errors})`);
                    setTimeout(() => {
                        db.get(`SELECT COUNT(*) as count FROM achievements`, (err, row) => {
                            console.log(`📊 В БД достижений: ${row?.count || 0}`);
                            if (row && row.count > 0) {
                                console.log(`✅ Успешно добавлено ${row.count} достижений!`);
                            } else {
                                console.log(`⚠️ Достижения не были добавлены. Возможно, таблица achievements не существует или имеет другую структуру.`);
                            }
                        });
                    }, 3000);
                    return;
                }
                
                const ach = achievementsList[index];
                const colId = colMap[ach.collection];
                
                if (!colId) {
                    // Пропускаем, если коллекция не найдена
                    index++;
                    setTimeout(insertNext, 2);
                    return;
                }
                
                db.run(
                    `INSERT OR IGNORE INTO achievements (code, name, description, collection_id, icon_svg, icon_color, points_reward, requirement_type, requirement_value, rarity)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [ach.code, ach.name, ach.desc, colId, ach.icon, ach.color, ach.points, ach.type, ach.value, ach.rarity],
                    function(err) {
                        if (err) {
                            console.error(`❌ Ошибка добавления ${ach.code}:`, err.message);
                            errors++;
                        } else if (this.changes > 0) {
                            added++;
                        }
                        index++;
                        if (index % 1 === 0) {
                            console.log(`📊 Прогресс: ${index}/${total}`);
                        }
                        setTimeout(insertNext, 2);
                    }
                );
            }
            
            setTimeout(insertNext, 100);
        });
    }
}

// ============ ОСТАЛЬНЫЕ API (полный набор) ============
function generateSlug(title) {
    const translit = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
        'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
        'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    };
    let slug = title.toLowerCase().trim();
    for (let [rus, lat] of Object.entries(translit)) {
        slug = slug.replace(new RegExp(rus, 'g'), lat);
    }
    slug = slug.replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, '-').replace(/-+/g, '-');
    return slug + '-' + Date.now().toString(36);
}


const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'supportnullmarket@gmail.com',
        pass: 'vttj quiz iyfp pndr'
    }
});


// ============ АДМИН MIDDLEWARE ============
function isAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    
    const adminRoles = [
        // Административные роли
        'tech_admin',           // Тех. Администратор
        'developer',            // Разработчики (Developer)
        'tech_lead',            // Ведущий разработчик (Tech Lead)
        'ciso',                 // Глава Безопасности (CISO / Head of Security)
        'ceo',                  // Исполнительный Директор (CEO)
        'board_of_directors',   // Совет Директоров
        
        // Руководители
        'head_beta_testers',    // Руководитель Бета-Тестеров
        'head_cooperation',     // Руководитель Сотрудничеств
        'head_marketing',       // Руководитель Маркетинга и RP
        'head_support',         // Руководитель Поддержки
        'head_moderation',      // Руководитель Модерации
        
        // Модераторы (имеют права на управление контентом)
        'content_label_moderator',          // Модератор разметки контента
        'content_moderator',                // Модератор Контента
        'senior_content_label_moderator',   // Старший Модератор разметки контента
        'senior_content_moderator',         // Старший Модератор контента
        
        // Поддержка (имеют доступ к тикетам)
        'support_trainee',      // Стажер Поддержки
        'tech_support',         // Тех. Поддержка
        'pro_support',          // Проф. Поддержка
        
        // Маркетинг и PR
        'smm_manager',          // Смм Менеджер
        'pr_manager',           // Пиар Менеджер
        'senior_pr_manager',    // Старший Пиар Менеджер
        
        // Рекрутер
        'recruiter'             // Рекрутер (HR)
    ];
    
    db.get(`SELECT role FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        
        if (adminRoles.includes(user.role)) {
            next();
        } else {
            res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
        }
    });
}


const emailVerificationCodes = {};

// Функция генерации 6-значного кода
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/api/send-verification', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email обязателен' });
    }
    
    db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, user) => {
        if (user) {
            return res.status(400).json({ error: 'Этот email уже зарегистрирован' });
        }
        
        const code = generateVerificationCode();
        const expiresAt = Date.now() + 5 * 60 * 1000;
        
        emailVerificationCodes[email] = {
            code: code,
            expires_at: expiresAt,
            attempts: 0
        };
        
        const mailOptions = {
            from: 'NULLMARKET <no-reply@nullmarket.com>',
            to: email,
            subject: 'Подтверждение email для NULLMARKET',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Подтверждение email</title>
                </head>
                <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f5fc;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f5fc; padding: 40px 0;">
                        <tr>
                            <td align="center">
                                <table width="100%" style="max-width: 560px; background: #ffffff; border-radius: 24px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08); overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.2);">
                                    
                                    <!-- Шапка -->
                                    <tr>
                                        <td style="padding: 40px 40px 24px; text-align: center;">
                                            <h1 style="margin: 0; font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #0F2027, #203A43, #2C5364); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">NULLMARKET</h1>
                                            <span style="display: inline-block; margin-top: 4px; background: linear-gradient(105deg, #d9e3f0, #ffffff); padding: 4px 16px; border-radius: 60px; font-size: 12px; font-weight: 600; color: #1e2a47; border: 1px solid #e2e8f0;">NULLID</span>
                                        </td>
                                    </tr>

                                    <!-- Разделитель -->
                                    <tr>
                                        <td style="padding: 0 40px;">
                                            <div style="height: 1px; background: linear-gradient(90deg, transparent, #e2e8f0, transparent);"></div>
                                        </td>
                                    </tr>

                                    <!-- Контент -->
                                    <tr>
                                        <td style="padding: 32px 40px;">
                                            <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0f172a;">Подтверждение регистрации</h2>
                                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #4b5563;">Для завершения создания аккаунта введите код подтверждения на странице регистрации.</p>

                                            <!-- Код -->
                                            <div style="background: #f8fafc; border-radius: 16px; padding: 24px; text-align: center; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                                                <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280; font-weight: 500;">Ваш код подтверждения</p>
                                                <div style="font-size: 42px; font-weight: 700; letter-spacing: 12px; color: #4f46e5; font-family: 'SF Mono', 'Menlo', monospace; background: #ffffff; padding: 12px 0; border-radius: 12px; border: 1px solid #e2e8f0;">${code}</div>
                                                <p style="margin: 12px 0 0; font-size: 13px; color: #94a3b8;">Код действителен в течение 5 минут</p>
                                            </div>

                                            <!-- Инструкция -->
                                            <div style="background: #eff6ff; border-radius: 12px; padding: 16px 20px; border-left: 4px solid #4f46e5; margin-bottom: 24px;">
                                                <p style="margin: 0; font-size: 14px; color: #1e293b; line-height: 1.6;">
                                                    <strong style="color: #4f46e5;">Как подтвердить:</strong><br>
                                                    1. Вернитесь на страницу регистрации<br>
                                                    2. Введите код <strong style="color: #0f172a;">${code}</strong> в поле подтверждения<br>
                                                    3. Нажмите «Проверить» и завершите создание аккаунта
                                                </p>
                                            </div>

                                            <!-- Предупреждение -->
                                            <div style="background: #fef2f2; border-radius: 12px; padding: 14px 18px; border: 1px solid #fecaca;">
                                                <p style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
                                                    <strong>Важно:</strong> Никому не сообщайте этот код. Сотрудники NULLMARKET никогда не запрашивают его.
                                                </p>
                                            </div>
                                        </td>
                                    </tr>

                                    <!-- Футер -->
                                    <tr>
                                        <td style="padding: 24px 40px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
                                            <table width="100%">
                                                <tr>
                                                    <td style="font-size: 13px; color: #94a3b8; line-height: 1.6;">
                                                        <p style="margin: 0 0 4px;">Это автоматическое письмо, пожалуйста, не отвечайте на него.</p>
                                                        <p style="margin: 0 0 4px;">Если вы не регистрировались на NULLMARKET, просто проигнорируйте это письмо.</p>
                                                        <p style="margin: 0; color: #64748b;">2026 NULLMARKET. Все права защищены.</p>
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td style="padding-top: 12px;">
                                                        <table cellpadding="0" cellspacing="0">
                                                            <tr>
                                                                <td style="padding-right: 16px; font-size: 13px;">
                                                                    <a href="#" style="color: #4f46e5; text-decoration: none; font-weight: 500;">Помощь</a>
                                                                </td>
                                                                <td style="padding-right: 16px; font-size: 13px;">
                                                                    <a href="#" style="color: #4f46e5; text-decoration: none; font-weight: 500;">Блог</a>
                                                                </td>
                                                                <td style="font-size: 13px;">
                                                                    <a href="#" style="color: #4f46e5; text-decoration: none; font-weight: 500;">Поддержка</a>
                                                                </td>
                                                            </tr>
                                                        </table>
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>

                                </table>
                            </td>
                        </tr>
                    </table>
                </body>
                </html>
            `
        };
        
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Ошибка отправки письма:', error);
                return res.status(500).json({ error: 'Ошибка отправки письма. Попробуйте позже.' });
            }
            
            console.log('Код подтверждения отправлен на ' + email + ': ' + code);
            res.json({ 
                success: true, 
                message: 'Код подтверждения отправлен на email',
                email: email
            });
        });
    });
});

function initDepartments() {
    const depts = [
        { name: 'Отдел Технической Поддержки', head_role: 'head_support' },
        { name: 'Отдел Модерации', head_role: 'head_moderation' },
        { name: 'Отдел Пиар Менеджеров', head_role: 'head_cooperation' },
        { name: 'Отдел Менеджеров', head_role: 'head_marketing' },
        { name: 'Отдел Кадров', head_role: 'head_beta_testers' },
        { name: 'Отдел Безопасности (УСБ)', head_role: 'ciso' }
    ];

    depts.forEach(dept => {
        db.run(
            `INSERT OR IGNORE INTO departments (name, head_name) VALUES (?, ?)`,
            [dept.name, dept.head_role]
        );
    });
}

// Маппинг ролей в отделы
function getDepartmentForRole(role) {
    const map = {
        // Отдел Технической Поддержки
        'support_trainee': 'Отдел Технической Поддержки',
        'tech_support': 'Отдел Технической Поддержки',
        'pro_support': 'Отдел Технической Поддержки',
        'head_support': 'Отдел Технической Поддержки',
        
        // Отдел Модерации
        'content_label_moderator': 'Отдел Модерации',
        'content_moderator': 'Отдел Модерации',
        'senior_content_label_moderator': 'Отдел Модерации',
        'senior_content_moderator': 'Отдел Модерации',
        'head_moderation': 'Отдел Модерации',
        
        // Отдел Пиар Менеджеров
        'pr_manager': 'Отдел Пиар Менеджеров',
        'senior_pr_manager': 'Отдел Пиар Менеджеров',
        'head_cooperation': 'Отдел Пиар Менеджеров',
        
        // Отдел Менеджеров
        'smm_manager': 'Отдел Менеджеров',
        'community_manager': 'Отдел Менеджеров',
        'head_marketing': 'Отдел Менеджеров',
        
        // Отдел Кадров
        'recruiter': 'Отдел Кадров',
        'head_beta_testers': 'Отдел Кадров',
        
        // Отдел Безопасности
        'ciso': 'Отдел Безопасности (УСБ)'
    };
    return map[role] || null;
}

// Получение руководителя отдела
function getHeadRoleForDepartment(deptName) {
    const map = {
        'Отдел Технической Поддержки': 'head_support',
        'Отдел Модерации': 'head_moderation',
        'Отдел Пиар Менеджеров': 'head_cooperation',
        'Отдел Менеджеров': 'head_marketing',
        'Отдел Кадров': 'head_beta_testers',
        'Отдел Безопасности (УСБ)': 'ciso'
    };
    return map[deptName] || null;
}


function checkLeadershipAccess(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const leadershipRoles = [
        'recruiter', 'head_beta_testers', 'head_cooperation', 'head_marketing',
        'head_support', 'head_moderation', 'tech_admin', 'developer',
        'tech_lead', 'ciso', 'ceo', 'board_of_directors'
    ];

    db.get(`SELECT role FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        if (err || !user || !leadershipRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        next();
    });
}



// ============ API ПРОВЕРКИ КОДА ============
app.post('/api/verify-code', (req, res) => {
    const { email, code } = req.body;
    
    if (!email || !code) {
        return res.status(400).json({ error: 'Email и код обязательны' });
    }
    
    const stored = emailVerificationCodes[email];
    
    if (!stored) {
        return res.status(400).json({ error: 'Код не найден. Запросите новый код.' });
    }
    
    if (Date.now() > stored.expires_at) {
        delete emailVerificationCodes[email];
        return res.status(400).json({ error: 'Код истёк. Запросите новый код.' });
    }
    
    stored.attempts += 1;
    if (stored.attempts > 5) {
        delete emailVerificationCodes[email];
        return res.status(400).json({ error: 'Превышено количество попыток. Запросите новый код.' });
    }
    
    if (stored.code !== code) {
        return res.status(400).json({ error: 'Неверный код. Осталось попыток: ' + (5 - stored.attempts) });
    }
    
    emailVerificationCodes[email].verified = true;
    
    res.json({ 
        success: true, 
        message: 'Email подтверждён! Теперь вы можете завершить регистрацию.'
    });
});

// Функция отправки приветственного сообщения от системного аккаунта
function sendWelcomeMessage(newUserId, userName) {
    db.get(`SELECT id FROM users WHERE user_id = '00000000'`, (err, systemUser) => {
        if (err || !systemUser) {
            console.error('❌ Системный аккаунт не найден');
            return;
        }

        const welcomeText = 
            `**Добро пожаловать в NULLMARKET, ${userName}!**\n\n` +
            `Мы рады видеть тебя на нашей платформе!\n\n` +
            `**Что тебя ждёт:**\n` +
            `• Маркетплейс с тысячами товаров\n` +
            `• Общение с другими пользователями\n` +
            `• Достижения и бонусы\n` +
            `• Безопасные сделки\n\n` +
            `**Первые шаги:**\n` +
            `1. Заполни свой профиль\n` +
            `2. Изучи раздел "Достижения"\n` +
            `3. Посмотри товары на маркетплейсе\n` +
            `4. Напиши в поддержку, если нужна помощь\n\n` +
            `Если у тебя есть вопросы, напиши нам в поддержку.\n\n` +
            `Удачи в использовании NULLMARKET!`;

        db.get(`
            SELECT id FROM chats 
            WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
        `, [newUserId, systemUser.id, systemUser.id, newUserId], (err, existingChat) => {
            if (existingChat) {
                db.run(`
                    INSERT INTO chat_messages (chat_id, sender_id, message, is_read)
                    VALUES (?, ?, ?, 0)
                `, [existingChat.id, systemUser.id, welcomeText], (err) => {
                    if (err) console.error('Ошибка отправки приветствия:', err);
                    else console.log(`✅ Приветствие отправлено пользователю ${userName}`);
                });
            } else {
                db.run(`
                    INSERT INTO chats (user1_id, user2_id, last_message, user2_unread)
                    VALUES (?, ?, ?, 1)
                `, [newUserId, systemUser.id, welcomeText], function(err) {
                    if (err) {
                        console.error('Ошибка создания чата с системным аккаунтом:', err);
                        return;
                    }
                    const chatId = this.lastID;
                    db.run(`
                        INSERT INTO chat_messages (chat_id, sender_id, message, is_read)
                        VALUES (?, ?, ?, 0)
                    `, [chatId, systemUser.id, welcomeText], (err) => {
                        if (err) console.error('Ошибка отправки приветствия:', err);
                        else console.log(`✅ Приветствие отправлено пользователю ${userName}`);
                    });
                });
            }
        });
    });
}

app.post('/api/register', async (req, res) => {
    const { name, email, phone, password, agree, verification_code } = req.body;
    
    if (!name || !email || !password || !agree) {
        return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }
    
    const stored = emailVerificationCodes[email];
    if (!stored || !stored.verified) {
        return res.status(400).json({ error: 'Необходимо подтвердить email. Проверьте почту и введите код.' });
    }
    
    if (Date.now() > stored.expires_at) {
        delete emailVerificationCodes[email];
        return res.status(400).json({ error: 'Код подтверждения истёк. Зарегистрируйтесь заново.' });
    }
    
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = generateUserId();
        const defaultAvatar = 'https://ui-avatars.com/api/?background=4f46e5&color=fff&name=' + encodeURIComponent(name) + '&size=40&rounded=true';
        
        db.run(`INSERT INTO users (user_id, name, email, phone, password_hash, avatar, role, verified, status) 
                VALUES (?, ?, ?, ?, ?, ?, 'user', 1, 'active')`,
            [userId, name, email, phone || null, passwordHash, defaultAvatar],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        if (err.message.includes('name')) {
                            return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
                        }
                        if (err.message.includes('email')) {
                            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
                        }
                        return res.status(400).json({ error: 'Пользователь с такими данными уже существует' });
                    }
                    return res.status(500).json({ error: 'Ошибка сервера при регистрации' });
                }
                
                // ===== НОВЫЙ КОД: Отправка приветствия =====
                const newUserId = this.lastID;
                // Отправляем приветственное сообщение от системного аккаунта
                sendWelcomeMessage(newUserId, name);
                // ===== КОНЕЦ НОВОГО КОДА =====
                
                delete emailVerificationCodes[email];
                
                res.json({ 
                    success: true, 
                    message: 'Регистрация успешна! Теперь вы можете войти.' 
                });
            });
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ============ API РЕГИСТРАЦИИ И АВТОРИЗАЦИИ ============
app.post('/api/register', async (req, res) => {
    const { name, email, phone, password, agree } = req.body;
    if (!name || !email || !password || !agree) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    if (password.length < 6) return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        const userId = generateUserId();
        const defaultAvatar = `https://ui-avatars.com/api/?background=4f46e5&color=fff&name=${encodeURIComponent(name)}&size=40&rounded=true`;
        db.run(`INSERT INTO users (user_id, name, email, phone, password_hash, avatar, role, verified, status) 
                VALUES (?, ?, ?, ?, ?, ?, 'user', 0, 'active')`,
            [userId, name, email, phone || null, passwordHash, defaultAvatar], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        if (err.message.includes('name')) return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
                        if (err.message.includes('email')) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
                        return res.status(400).json({ error: 'Пользователь с такими данными уже существует' });
                    }
                    return res.status(500).json({ error: 'Ошибка сервера при регистрации' });
                }
                res.json({ success: true, message: 'Регистрация успешна!' });
            });
    } catch (error) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

app.post('/api/login', async (req, res) => {
    const { identifier, password, remember } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Заполните все поля' });
    
    db.get(`SELECT * FROM users WHERE email = ? OR phone = ? OR name = ?`, [identifier, identifier, identifier], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Неверные данные' });
        
        // Проверяем пароль ДО проверки блокировки
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(401).json({ error: 'Неверные данные' });
        
        // Если пользователь заблокирован - создаём сессию, но возвращаем ошибку
        if (user.status === 'blocked') {
            req.session.userId = user.id;
            req.session.userName = user.name;
            req.session.userEmail = user.email;
            req.session.userRole = user.role || 'user';
            req.session.userUid = user.user_id;
            if (remember) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
            
            return res.status(403).json({ 
                error: 'Аккаунт заблокирован',
                blocked: true,
                user: {
                    id: user.id, 
                    user_id: user.user_id, 
                    name: user.name, 
                    email: user.email,
                    avatar: user.avatar, 
                    balance: user.balance, 
                    reviews_count: user.reviews_count || 0,
                    role: user.role, 
                    verified: user.verified || 0,
                    status: user.status
                }
            });
        }
        
        // Если пользователь активен
        req.session.userId = user.id;
        req.session.userName = user.name;
        req.session.userEmail = user.email;
        req.session.userRole = user.role || 'user';
        req.session.userUid = user.user_id;
        if (remember) req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 30;
        
        db.run(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
        
        res.json({ 
            success: true, 
            user: {
                id: user.id, 
                user_id: user.user_id, 
                name: user.name, 
                email: user.email,
                avatar: user.avatar, 
                balance: user.balance, 
                reviews_count: user.reviews_count || 0,
                role: user.role, 
                verified: user.verified || 0,
                status: user.status
            } 
        });
    });
});

app.post('/api/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });

app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.get(`SELECT id, user_id, name, email, phone, avatar, balance, reviews_count, role, verified, status, about, location,
                   reports_count, warnings, created_at, tickets_closed, messages_count, items_moderated,
                   reports_processed, admin_actions, successful_deals, hours_online, recruits_count,
                   warnings_issued, bans_issued, tickets_resolved_urgent, trainings_completed
            FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        if (err || !user) {
            req.session.destroy();
            return res.status(401).json({ error: 'Пользователь не найден' });
        }
        
        if (user.status === 'blocked') {
            return res.status(403).json({ 
                ...user, 
                blocked: true,
                error: 'Аккаунт заблокирован' 
            });
        }
        
        res.json(user);
    });
});
app.get('/api/user/:userId', (req, res) => {
    const userId = req.params.userId;
    db.get(`SELECT id, user_id, name, avatar, balance, reviews_count, role, verified, about, location, created_at,
                   tickets_closed, messages_count, successful_deals
            FROM users WHERE user_id = ? AND status = 'active'`, [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        db.all(`SELECT id, title, description, price, category, status, created_at FROM user_items WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`, [user.id], (err, items) => {
            db.all(`SELECT r.*, u.name as from_user_name, u.avatar as from_user_avatar FROM reviews r JOIN users u ON r.from_user_id = u.id WHERE r.to_user_id = ? ORDER BY r.created_at DESC LIMIT 20`, [user.id], (err, reviews) => {
                res.json({ ...user, items: items || [], reviews: reviews || [] });
            });
        });
    });
});

app.get('/api/finance/balance', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    db.get(
        `SELECT balance as ruble_balance, points_balance FROM users WHERE id = ?`,
        [req.session.userId],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: 'Ошибка получения баланса' });
            }
            res.json({
                ruble_balance: row.ruble_balance || 0,
                points_balance: row.points_balance || 0
            });
        }
    );
});

// ============================================================
// 1. СОЗДАНИЕ ЗАКАЗА (ПОКУПКА)
// ============================================================
app.post('/api/orders/create', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { item_id, credentials } = req.body;

    if (!item_id) {
        return res.status(400).json({ error: 'Укажите товар' });
    }

    console.log(`🛒 Создание заказа для товара ${item_id} пользователем ${req.session.userId}`);

    db.get(`
        SELECT i.*, u.balance as seller_balance 
        FROM items i 
        JOIN users u ON i.seller_id = u.id 
        WHERE i.id = ? AND i.status = 'active'
    `, [item_id], (err, item) => {
        if (err || !item) {
            console.error('❌ Товар не найден:', err);
            return res.status(404).json({ error: 'Товар не найден' });
        }

        if (item.seller_id === req.session.userId) {
            return res.status(400).json({ error: 'Нельзя купить свой товар' });
        }

        db.get(`SELECT balance FROM users WHERE id = ?`, [req.session.userId], (err, buyer) => {
            if (err || !buyer) {
                return res.status(500).json({ error: 'Ошибка проверки баланса' });
            }

            if (buyer.balance < item.price) {
                return res.status(400).json({ 
                    error: `Недостаточно средств. Нужно: ${item.price} ₽, доступно: ${buyer.balance} ₽` 
                });
            }

            const orderNumber = 'TMLN' + Date.now().toString(36).toUpperCase() + 
                               Math.random().toString(36).substring(2, 6).toUpperCase();

            // СПИСЫВАЕМ ДЕНЬГИ С ПОКУПАТЕЛЯ
            db.run(`
                UPDATE users SET balance = balance - ? WHERE id = ?
            `, [item.price, req.session.userId], function(err) {
                if (err) {
                    console.error('❌ Ошибка списания средств:', err);
                    return res.status(500).json({ error: 'Ошибка списания средств' });
                }

                db.run(`
                    INSERT INTO orders (order_number, item_id, buyer_id, seller_id, price, credentials, status)
                    VALUES (?, ?, ?, ?, ?, ?, 'pending')
                `, [orderNumber, item_id, req.session.userId, item.seller_id, item.price, credentials || null], function(err) {
                    if (err) {
                        console.error('❌ Ошибка создания заказа:', err.message);
                        db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [item.price, req.session.userId]);
                        return res.status(500).json({ error: 'Ошибка создания заказа: ' + err.message });
                    }

                    console.log(`✅ Заказ ${orderNumber} создан на сумму ${item.price} ₽`);

                    addOrderHistory(orderNumber, `Заказ #${orderNumber} создан. Средства заморожены на сумму ${item.price} ₽`);
                    addOrderHistory(orderNumber, `Ожидайте выполнения заказа от продавца`);

                    db.run(`
                        INSERT OR IGNORE INTO chats (user1_id, user2_id, item_id, last_message)
                        VALUES (?, ?, ?, ?)
                    `, [req.session.userId, item.seller_id, item_id, `Заказ #${orderNumber} создан. Средства заморожены.`]);

                    res.json({
                        success: true,
                        order_number: orderNumber,
                        order_id: this.lastID,
                        price: item.price,
                        status: 'pending',
                        url: `/order/${orderNumber}`
                    });
                });
            });
        });
    });
});


// ============================================================
// 2. ПОЛУЧЕНИЕ ЗАКАЗА ПО НОМЕРУ
// ============================================================
app.get('/api/orders/:orderNumber', (req, res) => {
    const { orderNumber } = req.params;

    db.get(`
        SELECT 
            o.id, o.order_number, o.item_id, o.buyer_id, o.seller_id,
            o.status, o.price, o.credentials, o.created_at,
            o.closed_at, o.confirmed_at, o.refunded_at,
            i.title as item_title, i.description as item_description,
            i.game_name, i.category_name,
            u.name as seller_name, u.avatar as seller_avatar,
            u.reviews_count as seller_reviews, u.user_id as seller_uid
        FROM orders o
        LEFT JOIN items i ON o.item_id = i.id
        LEFT JOIN users u ON o.seller_id = u.id
        WHERE o.order_number = ?
    `, [orderNumber], (err, order) => {
        if (err) {
            console.error('Ошибка получения заказа:', err.message);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        if (!order) {
            return res.status(404).json({ error: 'Заказ не найден' });
        }
        res.json(order);
    });
});

// Получение истории заказа
app.get('/api/orders/:orderNumber/history', (req, res) => {
    const { orderNumber } = req.params;

    db.all(`
        SELECT * FROM order_history 
        WHERE order_number = ? 
        ORDER BY created_at ASC
    `, [orderNumber], (err, history) => {
        if (err) {
            console.error('Ошибка получения истории:', err.message);
            return res.json([]);
        }
        res.json(history || []);
    });
});


// ============================================================
// 3. ПОЛУЧЕНИЕ СПИСКА ВСЕХ ЗАКАЗОВ
// ============================================================
app.get('/api/orders', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const isAdmin = req.session.userRole && 
        ['tech_admin', 'developer', 'ceo', 'board_of_directors', 'head_support', 'head_moderation'].includes(req.session.userRole);

    let query = `
        SELECT 
            o.id, o.order_number, o.item_id, o.buyer_id, o.seller_id,
            o.status, o.price, o.created_at, o.confirmed_at, o.refunded_at,
            i.title as item_title,
            u.name as seller_name,
            u2.name as buyer_name
        FROM orders o
        LEFT JOIN items i ON o.item_id = i.id
        LEFT JOIN users u ON o.seller_id = u.id
        LEFT JOIN users u2 ON o.buyer_id = u2.id
    `;

    if (!isAdmin) {
        query += ` WHERE o.buyer_id = ? OR o.seller_id = ? ORDER BY o.created_at DESC`;
        db.all(query, [req.session.userId, req.session.userId], (err, orders) => {
            if (err) {
                console.error('❌ Ошибка получения заказов:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            res.json(orders || []);
        });
    } else {
        query += ` ORDER BY o.created_at DESC`;
        db.all(query, (err, orders) => {
            if (err) {
                console.error('❌ Ошибка получения заказов:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            res.json(orders || []);
        });
    }
});

app.get('/api/orders/:orderNumber/history', (req, res) => {
    const { orderNumber } = req.params;

    db.all(`
        SELECT * FROM order_history 
        WHERE order_number = ? 
        ORDER BY created_at ASC
    `, [orderNumber], (err, history) => {
        if (err) {
            console.error('❌ Ошибка получения истории:', err.message);
            return res.json([]);
        }
        res.json(history || []);
    });
});

// 5. ПОДТВЕРЖДЕНИЕ ПОЛУЧЕНИЯ (ПОКУПАТЕЛЬ)
app.post('/api/orders/:orderNumber/confirm', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { orderNumber } = req.params;

    db.get(`
        SELECT o.*, i.price 
        FROM orders o
        JOIN items i ON o.item_id = i.id
        WHERE o.order_number = ? AND o.status = 'pending'
    `, [orderNumber], (err, order) => {
        if (err || !order) {
            return res.status(404).json({ error: 'Заказ не найден или уже обработан' });
        }

        if (order.buyer_id !== req.session.userId) {
            return res.status(403).json({ error: 'Только покупатель может подтвердить получение' });
        }

        db.run(`
            UPDATE users SET balance = balance + ? WHERE id = ?
        `, [order.price, order.seller_id], function(err) {
            if (err) {
                console.error('❌ Ошибка перевода средств:', err);
                return res.status(500).json({ error: 'Ошибка перевода средств' });
            }

            db.run(`
                UPDATE orders SET status = 'completed', confirmed_at = CURRENT_TIMESTAMP WHERE order_number = ?
            `, [orderNumber], function(err) {
                if (err) {
                    console.error('❌ Ошибка обновления заказа:', err);
                    return res.status(500).json({ error: 'Ошибка обновления заказа' });
                }

                addOrderHistory(orderNumber, `Покупатель подтвердил получение. Деньги переведены продавцу: ${order.price} ₽`);
                addOrderHistory(orderNumber, `Заказ #${orderNumber} успешно завершён`);

                res.json({
                    success: true,
                    message: 'Заказ подтверждён, деньги переведены продавцу',
                    status: 'completed'
                });
            });
        });
    });
});

// 6. ВОЗВРАТ ДЕНЕГ
app.post('/api/orders/:orderNumber/refund', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { orderNumber } = req.params;

    db.get(`
        SELECT o.*, i.price 
        FROM orders o
        JOIN items i ON o.item_id = i.id
        WHERE o.order_number = ? AND o.status = 'pending'
    `, [orderNumber], (err, order) => {
        if (err || !order) {
            return res.status(404).json({ error: 'Заказ не найден или уже обработан' });
        }

        if (order.seller_id !== req.session.userId && order.buyer_id !== req.session.userId) {
            return res.status(403).json({ error: 'У вас нет прав на возврат средств' });
        }

        db.run(`
            UPDATE users SET balance = balance + ? WHERE id = ?
        `, [order.price, order.buyer_id], function(err) {
            if (err) {
                console.error('❌ Ошибка возврата средств:', err);
                return res.status(500).json({ error: 'Ошибка возврата средств' });
            }

            db.run(`
                UPDATE orders SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP WHERE order_number = ?
            `, [orderNumber], function(err) {
                if (err) {
                    console.error('❌ Ошибка обновления заказа:', err);
                    return res.status(500).json({ error: 'Ошибка обновления заказа' });
                }

                addOrderHistory(orderNumber, `Деньги возвращены покупателю. Сумма ${order.price} ₽`);
                addOrderHistory(orderNumber, `Заказ #${orderNumber} отменён`);

                res.json({
                    success: true,
                    message: 'Деньги возвращены покупателю',
                    status: 'refunded'
                });
            });
        });
    });
});

// 7. АДМИНСКОЕ РАЗРЕШЕНИЕ СПОРА
app.post('/api/admin/orders/:orderNumber/resolve', isAdmin, (req, res) => {
    const { orderNumber } = req.params;
    const { action } = req.body;

    db.get(`
        SELECT o.*, i.price 
        FROM orders o
        JOIN items i ON o.item_id = i.id
        WHERE o.order_number = ? AND o.status = 'pending'
    `, [orderNumber], (err, order) => {
        if (err || !order) {
            return res.status(404).json({ error: 'Заказ не найден или уже обработан' });
        }

        if (action === 'release') {
            db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [order.price, order.seller_id], (err) => {
                if (err) {
                    console.error('❌ Ошибка перевода средств:', err);
                    return res.status(500).json({ error: 'Ошибка перевода средств' });
                }

                db.run(`UPDATE orders SET status = 'completed', confirmed_at = CURRENT_TIMESTAMP WHERE order_number = ?`, [orderNumber]);
                addOrderHistory(orderNumber, `Администратор разрешил спор в пользу продавца. Деньги переведены: ${order.price} ₽`);
                
                res.json({ success: true, message: 'Деньги переведены продавцу', status: 'completed' });
            });
        } else if (action === 'refund') {
            db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [order.price, order.buyer_id], (err) => {
                if (err) {
                    console.error('❌ Ошибка возврата средств:', err);
                    return res.status(500).json({ error: 'Ошибка возврата средств' });
                }

                db.run(`UPDATE orders SET status = 'refunded', refunded_at = CURRENT_TIMESTAMP WHERE order_number = ?`, [orderNumber]);
                addOrderHistory(orderNumber, `Администратор разрешил спор в пользу покупателя. Деньги возвращены: ${order.price} ₽`);
                
                res.json({ success: true, message: 'Деньги возвращены покупателю', status: 'refunded' });
            });
        } else {
            res.status(400).json({ error: 'Неверное действие. Используйте "release" или "refund"' });
        }
    });
});

console.log('✅ API заказов с эскроу загружены');

// ============================================================
// 8. ИЗМЕНЕНИЕ СТАТУСА ЗАКАЗА (АДМИН)
// ============================================================
app.put('/api/admin/orders/:orderNumber/status', isAdmin, (req, res) => {
    const { orderNumber } = req.params;
    const { status } = req.body;

    if (!['pending', 'completed', 'refunded', 'closed'].includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }

    db.run(`
        UPDATE orders SET status = ? WHERE order_number = ?
    `, [status, orderNumber], function(err) {
        if (err) {
            console.error('❌ Ошибка обновления статуса:', err);
            return res.status(500).json({ error: 'Ошибка обновления статуса' });
        }

        addOrderHistory(orderNumber, `Статус заказа изменён на: ${status}`);
        res.json({ success: true, status: status });
    });
});

// ============================================================
// 9. ПОЛУЧЕНИЕ СТАТИСТИКИ ПО ЗАКАЗАМ (АДМИН)
// ============================================================
app.get('/api/admin/orders/stats', isAdmin, (req, res) => {
    db.get(`SELECT COUNT(*) as total FROM orders`, (err, total) => {
        db.get(`SELECT COUNT(*) as pending FROM orders WHERE status = 'pending'`, (err, pending) => {
            db.get(`SELECT COUNT(*) as completed FROM orders WHERE status = 'completed'`, (err, completed) => {
                db.get(`SELECT COUNT(*) as refunded FROM orders WHERE status = 'refunded'`, (err, refunded) => {
                    db.get(`SELECT COALESCE(SUM(price), 0) as total_amount FROM orders`, (err, totalAmount) => {
                        db.get(`SELECT COALESCE(SUM(price), 0) as pending_amount FROM orders WHERE status = 'pending'`, (err, pendingAmount) => {
                            db.get(`SELECT COALESCE(SUM(price), 0) as completed_amount FROM orders WHERE status = 'completed'`, (err, completedAmount) => {
                                res.json({
                                    total: total?.total || 0,
                                    pending: pending?.pending || 0,
                                    completed: completed?.completed || 0,
                                    refunded: refunded?.refunded || 0,
                                    total_amount: totalAmount?.total_amount || 0,
                                    pending_amount: pendingAmount?.pending_amount || 0,
                                    completed_amount: completedAmount?.completed_amount || 0
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

console.log('✅ API заказов с эскроу загружены');

// Добавьте этот эндпоинт в server.js (после всех остальных API)
app.get('/api/debug/show-passwords', (req, res) => {
    // Проверяем, что запрос с localhost (безопасность)
    const clientIp = req.ip || req.connection.remoteAddress;
    if (clientIp !== '::1' && clientIp !== '127.0.0.1' && !clientIp.startsWith('::ffff:127.0.0.1')) {
        return res.status(403).json({ error: 'Доступ только с localhost' });
    }

    const emails = ['artemperekokin@gmail.com', 'platonmiwa2009@gmail.com'];
    const placeholders = emails.map(() => '?').join(',');
    
    db.all(
        `SELECT id, user_id, name, email, password_hash FROM users WHERE email IN (${placeholders})`,
        emails,
        async (err, users) => {
            if (err) {
                console.error('Ошибка получения пользователей:', err);
                return res.status(500).json({ error: 'Ошибка получения пользователей' });
            }

            if (!users || users.length === 0) {
                return res.json({ message: 'Пользователи не найдены' });
            }

            const results = [];
            for (const user of users) {
                // Пробуем дехэшировать пароль (bcrypt не умеет дехэшировать, только сравнивать)
                // Поэтому просто выводим хэш и говорим, что это хэш
                results.push({
                    id: user.id,
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email,
                    password_hash: user.password_hash,
                    note: 'Это хэшированный пароль (bcrypt). Для получения реального пароля используйте /api/debug/crack-password'
                });
                
                // Выводим в консоль
                console.log(`\n=== Пользователь: ${user.email} ===`);
                console.log(`ID: ${user.id}`);
                console.log(`Имя: ${user.name}`);
                console.log(`Хэш пароля: ${user.password_hash}`);
                console.log('=====================================\n');
            }

            res.json({
                message: 'Пароли выведены в консоль сервера',
                users: results
            });
        }
    );
});

// Дополнительный эндпоинт для попытки "взлома" пароля (только для отладки)
app.post('/api/debug/crack-password', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (clientIp !== '::1' && clientIp !== '127.0.0.1' && !clientIp.startsWith('::ffff:127.0.0.1')) {
        return res.status(403).json({ error: 'Доступ только с localhost' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Укажите email и пароль для проверки' });
    }

    db.get(
        `SELECT id, name, email, password_hash FROM users WHERE email = ?`,
        [email],
        async (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            try {
                const match = await bcrypt.compare(password, user.password_hash);
                if (match) {
                    console.log(`\n✅ УСПЕШНО! Пароль для ${email}: ${password}`);
                    res.json({
                        success: true,
                        message: `Пароль найден!`,
                        email: user.email,
                        password: password,
                        name: user.name
                    });
                } else {
                    res.json({
                        success: false,
                        message: 'Пароль не подходит',
                        email: user.email
                    });
                }
            } catch (e) {
                res.status(500).json({ error: 'Ошибка проверки пароля' });
            }
        }
    );
});

// ИСТОРИЯ ОПЕРАЦИЙ
app.get('/api/finance/history', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    db.all(
        `SELECT * FROM balance_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        [req.session.userId],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка получения истории' });
            }
            res.json(rows || []);
        }
    );
});

app.get('/api/admin/reports', isAdmin, (req, res) => {
    db.all(
        `SELECT mr.*, 
            u1.name as reporter_name, 
            u2.name as reported_name,
            cm.message as message_text
        FROM message_reports mr
        LEFT JOIN users u1 ON mr.reporter_id = u1.id
        LEFT JOIN users u2 ON mr.reported_user_id = u2.id
        LEFT JOIN chat_messages cm ON mr.message_id = cm.id
        ORDER BY mr.created_at DESC`,
        (err, reports) => {
            if (err) {
                console.error('Ошибка получения жалоб:', err);
                return res.status(500).json({ error: 'Ошибка получения жалоб' });
            }
            res.json(reports || []);
        }
    );
});

// Обновление статуса жалобы
app.put('/api/admin/reports/:id', isAdmin, (req, res) => {
    const { status, admin_note } = req.body;
    db.run(
        `UPDATE message_reports SET status = ?, admin_note = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, admin_note || '', req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка обновления жалобы:', err);
                return res.status(500).json({ error: 'Ошибка обновления жалобы' });
            }
            logAdminAction(req.session.userId, 'process_report', `Жалоба #${req.params.id} -> ${status}`);
            res.json({ success: true });
        }
    );
});

// Транзакции (финансовые операции)
app.get('/api/finance/transactions', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Если пользователь админ, показываем все транзакции
    const isAdminUser = req.session.userRole && ['tech_admin', 'developer', 'ceo', 'board_of_directors', 'head_support', 'head_moderation'].includes(req.session.userRole);
    
    let query = `SELECT bh.*, u.name as user_name FROM balance_history bh LEFT JOIN users u ON bh.user_id = u.id`;
    let params = [];
    
    if (!isAdminUser) {
        query += ` WHERE bh.user_id = ?`;
        params.push(req.session.userId);
    }
    
    query += ` ORDER BY bh.created_at DESC LIMIT 100`;
    
    db.all(query, params, (err, transactions) => {
        if (err) {
            console.error('Ошибка получения транзакций:', err);
            return res.status(500).json({ error: 'Ошибка получения транзакций' });
        }
        res.json(transactions || []);
    });
});

// Идеи (для менеджер-панели)
app.get('/api/manager/ideas', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.all(
        `SELECT * FROM vlad_ideas ORDER BY created_at DESC`,
        (err, ideas) => {
            if (err) {
                console.error('Ошибка получения идей:', err);
                return res.status(500).json({ error: 'Ошибка получения идей' });
            }
            res.json(ideas || []);
        }
    );
});

// Создание идеи
app.post('/api/manager/ideas', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { title, description } = req.body;
    if (!title || !description) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    db.get(`SELECT name FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        const author = user ? user.name : 'Пользователь';
        
        db.run(
            `INSERT INTO vlad_ideas (title, description, author, created_by, status) VALUES (?, ?, ?, ?, 'pending')`,
            [title, description, author, req.session.userId],
            function(err) {
                if (err) {
                    console.error('Ошибка создания идеи:', err);
                    return res.status(500).json({ error: 'Ошибка создания идеи' });
                }
                logAdminAction(req.session.userId, 'create_idea', `Создана идея: ${title}`);
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

// Обновление статуса идеи
app.put('/api/manager/ideas/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { status } = req.body;
    if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }
    
    db.run(
        `UPDATE vlad_ideas SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка обновления идеи:', err);
                return res.status(500).json({ error: 'Ошибка обновления идеи' });
            }
            logAdminAction(req.session.userId, 'update_idea', `Идея #${req.params.id} -> ${status}`);
            res.json({ success: true });
        }
    );
});

// Посты для менеджер-панели
app.get('/api/manager/posts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    // Используем существующую таблицу media_articles как посты
    db.all(
        `SELECT * FROM media_articles ORDER BY created_at DESC`,
        (err, posts) => {
            if (err) {
                console.error('Ошибка получения постов:', err);
                return res.status(500).json({ error: 'Ошибка получения постов' });
            }
            res.json(posts || []);
        }
    );
});

// Создание поста
app.post('/api/manager/posts', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { title, content, status } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    db.get(`SELECT name FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        const author = user ? user.name : 'Пользователь';
        const slug = generateSlug(title);
        
        db.run(
            `INSERT INTO media_articles (slug, title, content, tag, author_id, author_name, status) VALUES (?, ?, ?, 'Пост', ?, ?, ?)`,
            [slug, title, content, req.session.userId, author, status || 'draft'],
            function(err) {
                if (err) {
                    console.error('Ошибка создания поста:', err);
                    return res.status(500).json({ error: 'Ошибка создания поста' });
                }
                logAdminAction(req.session.userId, 'create_post', `Создан пост: ${title}`);
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});

// Обновление поста
app.put('/api/manager/posts/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { title, content, status } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }
    
    db.run(
        `UPDATE media_articles SET title = ?, content = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, content, status || 'draft', req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка обновления поста:', err);
                return res.status(500).json({ error: 'Ошибка обновления поста' });
            }
            logAdminAction(req.session.userId, 'update_post', `Обновлён пост #${req.params.id}`);
            res.json({ success: true });
        }
    );
});

// Удаление поста
app.delete('/api/manager/posts/:id', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.run(
        `DELETE FROM media_articles WHERE id = ?`,
        [req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка удаления поста:', err);
                return res.status(500).json({ error: 'Ошибка удаления поста' });
            }
            logAdminAction(req.session.userId, 'delete_post', `Удалён пост #${req.params.id}`);
            res.json({ success: true });
        }
    );
});

// Промокоды (уже есть, но проверим)
app.get('/api/admin/promocodes', isAdmin, (req, res) => {
    db.all(
        `SELECT p.*, u.name as created_by FROM promocodes p LEFT JOIN users u ON u.id = 1 ORDER BY p.created_at DESC`,
        (err, promocodes) => {
            if (err) {
                console.error('Ошибка получения промокодов:', err);
                return res.status(500).json({ error: 'Ошибка получения промокодов' });
            }
            res.json(promocodes || []);
        }
    );
});

app.get('/api/icons/available', (req, res) => {
    db.all(
        `SELECT * FROM available_icons ORDER BY category, display_name`,
        (err, icons) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки значков' });
            res.json(icons || []);
        }
    );
});



// Получение значков пользователя
app.get('/api/icons/user/:userId', (req, res) => {
    const { userId } = req.params;
    db.all(
        `SELECT ui.*, ai.display_name, ai.icon_url, ai.color, ai.description, ai.category
         FROM user_icons ui
         JOIN available_icons ai ON ui.role_key = ai.role_key
         WHERE ui.user_id = ? AND ui.is_active = 1
         ORDER BY ai.category, ai.display_name`,
        [userId],
        (err, icons) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки значков пользователя' });
            
            // Добавляем информацию о том, может ли пользователь сам управлять этим значком
            res.json(icons || []);
        }
    );
});



// Получение значков текущего пользователя
app.get('/api/icons/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.all(
        `SELECT ui.*, ai.display_name, ai.icon_url, ai.color, ai.description, ai.category, ai.can_assign
         FROM user_icons ui
         JOIN available_icons ai ON ui.role_key = ai.role_key
         WHERE ui.user_id = ? AND ui.is_active = 1
         ORDER BY ai.category, ai.display_name`,
        [req.session.userId],
        (err, icons) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки значков' });
            res.json(icons || []);
        }
    );
});

// Выдача значка пользователю (только админ)
app.post('/api/icons/grant', isAdmin, (req, res) => {
    const { user_id, role_key, expires_in_days } = req.body;
    
    if (!user_id || !role_key) {
        return res.status(400).json({ error: 'Укажите пользователя и значок' });
    }
    
    // Проверяем, существует ли такой значок
    db.get(
        `SELECT * FROM available_icons WHERE role_key = ?`,
        [role_key],
        (err, icon) => {
            if (err || !icon) {
                return res.status(404).json({ error: 'Значок не найден' });
            }
            
            // Проверяем, не имеет ли пользователь уже этот значок
            db.get(
                `SELECT id FROM user_icons WHERE user_id = ? AND role_key = ? AND is_active = 1`,
                [user_id, role_key],
                (err, existing) => {
                    if (existing) {
                        return res.status(400).json({ error: 'Пользователь уже имеет этот значок' });
                    }
                    
                    const expiresAt = expires_in_days ? 
                        new Date(Date.now() + expires_in_days * 24 * 60 * 60 * 1000).toISOString() : 
                        null;
                    
                    db.run(
                        `INSERT INTO user_icons (user_id, role_key, assigned_by, expires_at)
                         VALUES (?, ?, ?, ?)`,
                        [user_id, role_key, req.session.userId, expiresAt],
                        function(err) {
                            if (err) {
                                return res.status(500).json({ error: 'Ошибка выдачи значка' });
                            }
                            
                            // Логируем действие
                            db.get(`SELECT name FROM users WHERE id = ?`, [user_id], (err, user) => {
                                logAdminAction(
                                    req.session.userId,
                                    'grant_icon',
                                    `Выдан значок "${icon.display_name}" пользователю ${user?.name || user_id}`
                                );
                            });
                            
                            res.json({
                                success: true,
                                message: `Значок "${icon.display_name}" успешно выдан`,
                                icon: {
                                    role_key: icon.role_key,
                                    display_name: icon.display_name,
                                    icon_url: icon.icon_url,
                                    color: icon.color
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// Снятие значка (админ или сам пользователь, если can_assign = 'user')
app.delete('/api/icons/remove', (req, res) => {
    const { user_id, role_key } = req.body;
    
    if (!user_id || !role_key) {
        return res.status(400).json({ error: 'Укажите пользователя и значок' });
    }
    
    // Проверяем, может ли пользователь сам снимать этот значок
    db.get(
        `SELECT ai.can_assign, ai.display_name FROM available_icons ai WHERE ai.role_key = ?`,
        [role_key],
        (err, icon) => {
            if (err || !icon) {
                return res.status(404).json({ error: 'Значок не найден' });
            }
            
            const isSelf = req.session.userId == user_id;
            const canSelfRemove = icon.can_assign === 'user';
            
            if (isSelf && !canSelfRemove) {
                return res.status(403).json({ error: 'Вы не можете снять этот значок самостоятельно' });
            }
            
            if (!isSelf) {
                // Проверяем права админа для снятия чужих значков
                const adminRoles = ['tech_admin', 'developer', 'tech_lead', 'ciso', 'ceo', 'board_of_directors', 'head_support', 'head_moderation'];
                db.get(`SELECT role FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
                    if (err || !user || !adminRoles.includes(user.role)) {
                        return res.status(403).json({ error: 'Недостаточно прав для снятия значка' });
                    }
                    
                    removeIcon();
                });
            } else {
                removeIcon();
            }
            
            function removeIcon() {
                db.run(
                    `UPDATE user_icons SET is_active = 0 WHERE user_id = ? AND role_key = ?`,
                    [user_id, role_key],
                    function(err) {
                        if (err) {
                            return res.status(500).json({ error: 'Ошибка снятия значка' });
                        }
                        
                        res.json({
                            success: true,
                            message: `Значок "${icon.display_name}" снят`
                        });
                    }
                );
            }
        }
    );
});

// Получение списка пользователей со значками (для админа)
app.get('/api/icons/admin/users', isAdmin, (req, res) => {
    db.all(
        `SELECT 
            u.id, u.user_id, u.name, u.avatar,
            GROUP_CONCAT(ai.role_key) as icon_keys,
            GROUP_CONCAT(ai.display_name) as icon_names
         FROM users u
         LEFT JOIN user_icons ui ON u.id = ui.user_id AND ui.is_active = 1
         LEFT JOIN available_icons ai ON ui.role_key = ai.role_key
         GROUP BY u.id
         ORDER BY u.name`,
        (err, users) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
            res.json(users || []);
        }
    );
}); 

// ПОПОЛНЕНИЕ БАЛАНСА
app.post('/api/finance/topup', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { amount, method } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Введите корректную сумму' });
    }

    // Симуляция пополнения (в реальном проекте здесь был бы платёжный шлюз)
    db.run(
        `UPDATE users SET balance = COALESCE(balance, 0) + ? WHERE id = ?`,
        [amount, req.session.userId],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Ошибка пополнения' });
            }

            // Записываем в историю
            db.run(
                `INSERT INTO balance_history (user_id, amount, reason, type) VALUES (?, ?, ?, 'income')`,
                [req.session.userId, amount, `Пополнение через ${method || 'карту'}`],
                (err) => {
                    if (err) console.error('Ошибка записи истории:', err);
                }
            );

            // Начисляем бонусные баллы (1% от суммы пополнения)
            const bonusPoints = Math.floor(amount * 0.01);
            if (bonusPoints > 0) {
                db.run(
                    `UPDATE users SET points_balance = COALESCE(points_balance, 0) + ? WHERE id = ?`,
                    [bonusPoints, req.session.userId],
                    (err) => {
                        if (!err) {
                            db.run(
                                `INSERT INTO balance_history (user_id, amount, reason, type) VALUES (?, ?, ?, 'bonus')`,
                                [req.session.userId, bonusPoints, `Бонус за пополнение (1%)`],
                                (err) => { if (err) console.error('Ошибка записи бонуса:', err); }
                            );
                        }
                    }
                );
            }

            // Проверка достижений (баланс)
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'balance_amount');
            }, 500);

            res.json({ success: true, message: 'Баланс пополнен' });
        }
    );
});

app.get('/api/leadership/departments', checkLeadershipAccess, (req, res) => {
    db.all(`SELECT * FROM departments ORDER BY name`, (err, departments) => {
        if (err) {
            console.error('Ошибка получения отделов:', err);
            return res.status(500).json({ error: 'Ошибка получения отделов' });
        }

        db.all(`SELECT id, user_id, name, role, avatar, status FROM users WHERE role != 'user' AND status = 'active'`, (err, allStaff) => {
            if (err) {
                console.error('Ошибка получения сотрудников:', err);
                return res.status(500).json({ error: 'Ошибка получения сотрудников' });
            }

            const result = departments.map(dept => {
                const deptStaff = allStaff.filter(s => getDepartmentForRole(s.role) === dept.name);
                const headRole = getHeadRoleForDepartment(dept.name);
                const head = deptStaff.find(s => s.role === headRole);
                
                return {
                    ...dept,
                    head: head ? head.name : 'Не назначен',
                    head_id: head ? head.id : null,
                    staff: deptStaff.map(s => ({
                        id: s.id,
                        user_id: s.user_id,
                        name: s.name,
                        role: s.role,
                        role_display: getRoleName(s.role),
                        avatar: s.avatar,
                        status: s.status,
                        is_head: s.role === headRole
                    })),
                    staff_count: deptStaff.length
                };
            });

            res.json(result);
        });
    });
});

// ============ API РУКОВОДСТВА ============

// Проверка доступа к руководству
function checkLeadershipAccess(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const leadershipRoles = [
        'recruiter', 'head_beta_testers', 'head_cooperation', 'head_marketing',
        'head_support', 'head_moderation', 'tech_admin', 'developer',
        'tech_lead', 'ciso', 'ceo', 'board_of_directors'
    ];

    db.get(`SELECT role FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        if (err || !user || !leadershipRoles.includes(user.role)) {
            return res.status(403).json({ error: 'Доступ запрещён' });
        }
        next();
    });
}

app.get('/api/leadership/departments', checkLeadershipAccess, (req, res) => {
    db.all(`SELECT * FROM departments ORDER BY name`, (err, departments) => {
        if (err) {
            console.error('Ошибка получения отделов:', err);
            return res.status(500).json({ error: 'Ошибка получения отделов' });
        }

        db.all(`SELECT id, user_id, name, role, avatar, status FROM users WHERE role != 'user' AND status = 'active'`, (err, allStaff) => {
            if (err) {
                console.error('Ошибка получения сотрудников:', err);
                return res.status(500).json({ error: 'Ошибка получения сотрудников' });
            }

            const result = departments.map(dept => {
                const deptStaff = allStaff.filter(s => getDepartmentForRole(s.role) === dept.name);
                const headRole = getHeadRoleForDepartment(dept.name);
                const head = deptStaff.find(s => s.role === headRole);
                
                return {
                    ...dept,
                    head: head ? head.name : 'Не назначен',
                    head_id: head ? head.id : null,
                    staff: deptStaff.map(s => ({
                        id: s.id,
                        user_id: s.user_id,
                        name: s.name,
                        role: s.role,
                        role_display: getRoleName(s.role),
                        avatar: s.avatar,
                        status: s.status,
                        is_head: s.role === headRole
                    })),
                    staff_count: deptStaff.length
                };
            });

            res.json(result);
        });
    });
});

// --- ДОБАВЛЕНИЕ ОТДЕЛА ---
app.post('/api/leadership/departments', checkLeadershipAccess, (req, res) => {
    const { name, description, head_id } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Название отдела обязательно' });
    }

    if (head_id) {
        db.get(`SELECT name FROM users WHERE id = ?`, [head_id], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка поиска руководителя' });
            }
            db.run(
                `INSERT INTO departments (name, description, head_id, head_name) VALUES (?, ?, ?, ?)`,
                [name, description || '', head_id, user ? user.name : null],
                function(err) {
                    if (err) {
                        if (err.message.includes('UNIQUE')) {
                            return res.status(400).json({ error: 'Отдел с таким названием уже существует' });
                        }
                        return res.status(500).json({ error: 'Ошибка создания отдела' });
                    }
                    logAdminAction(req.session.userId, 'create_department', `Создан отдел: ${name}`);
                    res.json({ success: true, id: this.lastID });
                }
            );
        });
    } else {
        db.run(
            `INSERT INTO departments (name, description) VALUES (?, ?)`,
            [name, description || ''],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Отдел с таким названием уже существует' });
                    }
                    return res.status(500).json({ error: 'Ошибка создания отдела' });
                }
                logAdminAction(req.session.userId, 'create_department', `Создан отдел: ${name}`);
                res.json({ success: true, id: this.lastID });
            }
        );
    }
});

// --- ОБНОВЛЕНИЕ ОТДЕЛА ---
app.put('/api/leadership/departments/:id', checkLeadershipAccess, (req, res) => {
    const { name, description, head_id } = req.body;
    const deptId = req.params.id;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    
    const updateDept = (headName) => {
        if (head_id) {
            updates.push('head_id = ?');
            updates.push('head_name = ?');
            params.push(head_id);
            params.push(headName);
        }
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(deptId);
        
        db.run(`UPDATE departments SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
            if (err) {
                return res.status(500).json({ error: 'Ошибка обновления отдела' });
            }
            logAdminAction(req.session.userId, 'update_department', `Обновлён отдел #${deptId}`);
            res.json({ success: true });
        });
    };

    if (head_id) {
        db.get(`SELECT name FROM users WHERE id = ?`, [head_id], (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка поиска руководителя' });
            }
            updateDept(user ? user.name : null);
        });
    } else {
        updateDept(null);
    }
});

// --- УДАЛЕНИЕ ОТДЕЛА ---
app.delete('/api/leadership/departments/:id', checkLeadershipAccess, (req, res) => {
    db.run(`DELETE FROM departments WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Ошибка удаления отдела' });
        }
        logAdminAction(req.session.userId, 'delete_department', `Удалён отдел #${req.params.id}`);
        res.json({ success: true });
    });
});

// --- ПОЛУЧЕНИЕ СОТРУДНИКОВ ДЛЯ РУКОВОДСТВА ---
app.get('/api/leadership/staff', checkLeadershipAccess, (req, res) => {
    db.all(`
        SELECT 
            u.id, u.user_id, u.name, u.role, u.avatar, u.status, u.email, u.phone,
            u.created_at, u.last_login, u.balance, u.reviews_count,
            u.tickets_closed, u.messages_count, u.successful_deals,
            u.warnings, u.admin_actions, u.hours_online,
            d.name as department_name,
            d.id as department_id,
            CASE WHEN d.head_id = u.id THEN 1 ELSE 0 END as is_head
        FROM users u
        LEFT JOIN departments d ON d.name = (
            CASE 
                WHEN u.role IN ('support_trainee', 'tech_support', 'pro_support', 'head_support') 
                    THEN 'Отдел Технической Поддержки'
                WHEN u.role IN ('content_label_moderator', 'content_moderator', 'senior_content_label_moderator', 'senior_content_moderator', 'head_moderation') 
                    THEN 'Отдел Модерации'
                WHEN u.role IN ('pr_manager', 'senior_pr_manager', 'head_cooperation') 
                    THEN 'Отдел Пиар Менеджеров'
                WHEN u.role IN ('smm_manager', 'community_manager', 'head_marketing') 
                    THEN 'Отдел Менеджеров'
                WHEN u.role IN ('recruiter', 'head_beta_testers') 
                    THEN 'Отдел Кадров'
                WHEN u.role IN ('ciso') 
                    THEN 'Отдел Безопасности (УСБ)'
                ELSE NULL
            END
        )
        WHERE u.role != 'user' AND u.status = 'active'
        ORDER BY d.name, u.role
    `, (err, staff) => {
        if (err) {
            console.error('Ошибка получения сотрудников:', err);
            return res.status(500).json({ error: 'Ошибка получения сотрудников' });
        }
        res.json(staff || []);
    });
});

// --- ПОЛУЧЕНИЕ СТАТИСТИКИ ДЛЯ ДАШБОРДА ---
app.get('/api/leadership/stats', checkLeadershipAccess, (req, res) => {
    db.get(`SELECT COUNT(*) as totalStaff FROM users WHERE role != 'user' AND status = 'active'`, (err, staffCount) => {
        if (err) {
            console.error('Ошибка подсчёта сотрудников:', err);
            return res.status(500).json({ error: 'Ошибка подсчёта сотрудников' });
        }
        
        db.get(`SELECT COUNT(*) as totalDepartments FROM departments`, (err, deptCount) => {
            if (err) {
                console.error('Ошибка подсчёта отделов:', err);
                return res.status(500).json({ error: 'Ошибка подсчёта отделов' });
            }
            
            db.get(`SELECT COUNT(*) as pendingVacations FROM vacations WHERE status = 'pending'`, (err, vacationCount) => {
                if (err) {
                    console.error('Ошибка подсчёта отпусков:', err);
                    return res.status(500).json({ error: 'Ошибка подсчёта отпусков' });
                }
                
                db.get(`SELECT COALESCE(AVG(rating), 0) as avgRating FROM departments`, (err, avgRating) => {
                    if (err) {
                        console.error('Ошибка подсчёта рейтинга:', err);
                        return res.status(500).json({ error: 'Ошибка подсчёта рейтинга' });
                    }
                    
                    db.get(`SELECT COUNT(*) as completedGoals FROM strategic_goals WHERE status = 'completed'`, (err, completedGoals) => {
                        if (err) {
                            console.error('Ошибка подсчёта целей:', err);
                            return res.status(500).json({ error: 'Ошибка подсчёта целей' });
                        }
                        
                        db.get(`SELECT COUNT(*) as totalGoals FROM strategic_goals`, (err, totalGoals) => {
                            if (err) {
                                console.error('Ошибка подсчёта целей:', err);
                                return res.status(500).json({ error: 'Ошибка подсчёта целей' });
                            }
                            
                            const goalProgress = totalGoals?.totalGoals > 0 
                                ? Math.round((completedGoals?.completedGoals || 0) / totalGoals.totalGoals * 100) 
                                : 0;

                            res.json({
                                totalStaff: staffCount?.totalStaff || 0,
                                totalDepartments: deptCount?.totalDepartments || 0,
                                pendingVacations: vacationCount?.pendingVacations || 0,
                                avgRating: parseFloat(avgRating?.avgRating || 0).toFixed(1),
                                goalProgress: goalProgress
                            });
                        });
                    });
                });
            });
        });
    });
});

// --- ПОЛУЧЕНИЕ KPI ---
app.get('/api/leadership/kpis', checkLeadershipAccess, (req, res) => {
    db.all(`SELECT * FROM kpis ORDER BY id`, (err, kpis) => {
        if (err) {
            console.error('Ошибка получения KPI:', err);
            return res.status(500).json({ error: 'Ошибка получения KPI' });
        }
        res.json(kpis || []);
    });
});

// --- ОБНОВЛЕНИЕ KPI ---
app.put('/api/leadership/kpis/:id', checkLeadershipAccess, (req, res) => {
    const { value, target, status, trend } = req.body;
    db.run(
        `UPDATE kpis SET value = ?, target = ?, status = ?, trend = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [value, target, status, trend, req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка обновления KPI:', err);
                return res.status(500).json({ error: 'Ошибка обновления KPI' });
            }
            res.json({ success: true });
        }
    );
});

// --- ПОЛУЧЕНИЕ СТРАТЕГИЧЕСКИХ ЦЕЛЕЙ ---
app.get('/api/leadership/goals', checkLeadershipAccess, (req, res) => {
    db.all(`
        SELECT sg.*, u.name as created_by_name, d.name as department_name
        FROM strategic_goals sg
        LEFT JOIN users u ON sg.created_by = u.id
        LEFT JOIN departments d ON sg.department_id = d.id
        ORDER BY sg.created_at DESC
    `, (err, goals) => {
        if (err) {
            console.error('Ошибка получения целей:', err);
            return res.status(500).json({ error: 'Ошибка получения целей' });
        }
        res.json(goals || []);
    });
});

// --- СОЗДАНИЕ СТРАТЕГИЧЕСКОЙ ЦЕЛИ ---
app.post('/api/leadership/goals', checkLeadershipAccess, (req, res) => {
    const { title, description, progress, deadline, status, department_id } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'Название цели обязательно' });
    }

    db.run(
        `INSERT INTO strategic_goals (title, description, progress, deadline, status, department_id, created_by) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description || '', progress || 0, deadline || null, status || 'pending', department_id || null, req.session.userId],
        function(err) {
            if (err) {
                console.error('Ошибка создания цели:', err);
                return res.status(500).json({ error: 'Ошибка создания цели' });
            }
            logAdminAction(req.session.userId, 'create_goal', `Создана цель: ${title}`);
            res.json({ success: true, id: this.lastID });
        }
    );
});

// --- ОБНОВЛЕНИЕ СТРАТЕГИЧЕСКОЙ ЦЕЛИ ---
app.put('/api/leadership/goals/:id', checkLeadershipAccess, (req, res) => {
    const { title, description, progress, deadline, status, department_id } = req.body;
    const updates = [];
    const params = [];

    if (title) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (progress !== undefined) { updates.push('progress = ?'); params.push(progress); }
    if (deadline) { updates.push('deadline = ?'); params.push(deadline); }
    if (status) { updates.push('status = ?'); params.push(status); }
    if (department_id !== undefined) { updates.push('department_id = ?'); params.push(department_id); }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.run(`UPDATE strategic_goals SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) {
            console.error('Ошибка обновления цели:', err);
            return res.status(500).json({ error: 'Ошибка обновления цели' });
        }
        logAdminAction(req.session.userId, 'update_goal', `Обновлена цель #${req.params.id}`);
        res.json({ success: true });
    });
});

// --- УДАЛЕНИЕ СТРАТЕГИЧЕСКОЙ ЦЕЛИ ---
app.delete('/api/leadership/goals/:id', checkLeadershipAccess, (req, res) => {
    db.run(`DELETE FROM strategic_goals WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            console.error('Ошибка удаления цели:', err);
            return res.status(500).json({ error: 'Ошибка удаления цели' });
        }
        logAdminAction(req.session.userId, 'delete_goal', `Удалена цель #${req.params.id}`);
        res.json({ success: true });
    });
});

// --- ПОЛУЧЕНИЕ ОТПУСКОВ ---
app.get('/api/leadership/vacations', checkLeadershipAccess, (req, res) => {
    db.all(`
        SELECT v.*, d.name as department_name
        FROM vacations v
        LEFT JOIN departments d ON v.department_id = d.id
        ORDER BY v.created_at DESC
    `, (err, vacations) => {
        if (err) {
            console.error('Ошибка получения отпусков:', err);
            return res.status(500).json({ error: 'Ошибка получения отпусков' });
        }
        res.json(vacations || []);
    });
});

// --- СОЗДАНИЕ ЗАЯВКИ НА ОТПУСК ---
app.post('/api/leadership/vacations', checkLeadershipAccess, (req, res) => {
    const { user_id, user_name, department_id, start_date, end_date } = req.body;
    if (!user_name || !start_date || !end_date) {
        return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    db.run(
        `INSERT INTO vacations (user_id, user_name, department_id, start_date, end_date, status) 
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [user_id || null, user_name, department_id || null, start_date, end_date],
        function(err) {
            if (err) {
                console.error('Ошибка создания заявки:', err);
                return res.status(500).json({ error: 'Ошибка создания заявки' });
            }
            logAdminAction(req.session.userId, 'create_vacation', `Создана заявка на отпуск для ${user_name}`);
            res.json({ success: true, id: this.lastID });
        }
    );
});

// --- ОБРАБОТКА ЗАЯВКИ НА ОТПУСК ---
app.put('/api/leadership/vacations/:id/process', checkLeadershipAccess, (req, res) => {
    const { status } = req.body;
    if (!status || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Неверный статус' });
    }

    db.run(
        `UPDATE vacations SET status = ?, approved_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, req.session.userId, req.params.id],
        function(err) {
            if (err) {
                console.error('Ошибка обработки заявки:', err);
                return res.status(500).json({ error: 'Ошибка обработки заявки' });
            }
            logAdminAction(req.session.userId, 'process_vacation', `Заявка #${req.params.id} -> ${status}`);
            res.json({ success: true });
        }
    );
});

// --- ПОЛУЧЕНИЕ ОТЧЁТОВ ---
app.get('/api/leadership/reports', checkLeadershipAccess, (req, res) => {
    db.all(`
        SELECT r.*, u.name as author_name
        FROM reports r
        LEFT JOIN users u ON r.author_id = u.id
        ORDER BY r.created_at DESC
    `, (err, reports) => {
        if (err) {
            console.error('Ошибка получения отчётов:', err);
            return res.status(500).json({ error: 'Ошибка получения отчётов' });
        }
        res.json(reports || []);
    });
});

// --- СОЗДАНИЕ ОТЧЁТА ---
app.post('/api/leadership/reports', checkLeadershipAccess, (req, res) => {
    const { title, content, type } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Заполните все обязательные поля' });
    }

    db.get(`SELECT name FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
        const authorName = user ? user.name : 'Пользователь';
        
        db.run(
            `INSERT INTO reports (title, content, type, author_id, author_name, status) VALUES (?, ?, ?, ?, ?, 'published')`,
            [title, content, type || 'quarterly', req.session.userId, authorName],
            function(err) {
                if (err) {
                    console.error('Ошибка создания отчёта:', err);
                    return res.status(500).json({ error: 'Ошибка создания отчёта' });
                }
                logAdminAction(req.session.userId, 'create_report', `Создан отчёт: ${title}`);
                res.json({ success: true, id: this.lastID });
            }
        );
    });
});



// ВЫВОД СРЕДСТВ
app.post('/api/finance/withdraw', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { amount, details } = req.body;
    if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Введите корректную сумму' });
    }
    if (!details || details.trim().length < 3) {
        return res.status(400).json({ error: 'Введите реквизиты' });
    }

    db.get(
        `SELECT balance FROM users WHERE id = ?`,
        [req.session.userId],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: 'Ошибка проверки баланса' });
            }

            if (row.balance < amount) {
                return res.status(400).json({ error: 'Недостаточно средств' });
            }

            // Списываем сумму
            db.run(
                `UPDATE users SET balance = balance - ? WHERE id = ?`,
                [amount, req.session.userId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка вывода' });
                    }

                    // Записываем в историю
                    db.run(
                        `INSERT INTO balance_history (user_id, amount, reason, type) VALUES (?, ?, ?, 'expense')`,
                        [req.session.userId, amount, `Вывод на ${details || 'реквизиты'}`],
                        (err) => {
                            if (err) console.error('Ошибка записи истории:', err);
                        }
                    );

                    // Запись в withdrawals для админа
                    db.run(
                        `INSERT INTO withdrawals (user_id, amount, details, status) VALUES (?, ?, ?, 'pending')`,
                        [req.session.userId, amount, details],
                        (err) => {
                            if (err) console.error('Ошибка создания заявки на вывод:', err);
                        }
                    );

                    res.json({ success: true, message: 'Заявка на вывод создана' });
                }
            );
        }
    );
});

// КОНВЕРТАЦИЯ БАЛЛОВ → РУБЛИ
app.post('/api/finance/convert', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const { points } = req.body;
    if (!points || points <= 0) {
        return res.status(400).json({ error: 'Введите корректное количество баллов' });
    }
    if (points > 1000) {
        return res.status(400).json({ error: 'Максимум 1000 баллов за раз' });
    }

    db.get(
        `SELECT points_balance FROM users WHERE id = ?`,
        [req.session.userId],
        (err, row) => {
            if (err || !row) {
                return res.status(500).json({ error: 'Ошибка проверки баллов' });
            }

            if (row.points_balance < points) {
                return res.status(400).json({ error: 'Недостаточно баллов' });
            }

            const rubles = points * 0.5;

            // Списываем баллы, начисляем рубли
            db.run(
                `UPDATE users SET points_balance = points_balance - ?, balance = COALESCE(balance, 0) + ? WHERE id = ?`,
                [points, rubles, req.session.userId],
                function(err) {
                    if (err) {
                        return res.status(500).json({ error: 'Ошибка конвертации' });
                    }

                    // Записываем в историю (списание баллов)
                    db.run(
                        `INSERT INTO balance_history (user_id, amount, reason, type) VALUES (?, ?, ?, 'conversion')`,
                        [req.session.userId, points, `Конвертация баллов в рубли (${points} баллов → ${rubles.toFixed(2)} ₽)`],
                        (err) => {
                            if (err) console.error('Ошибка записи истории:', err);
                        }
                    );

                    res.json({ success: true, message: `Конвертировано ${points} баллов → ${rubles.toFixed(2)} ₽` });
                }
            );
        }
    );
});

app.get('/api/media/articles', (req, res) => {
    const { limit = 20, offset = 0, tag } = req.query;
    let query = `SELECT a.*, u.avatar as author_avatar FROM media_articles a 
                 LEFT JOIN users u ON a.author_id = u.id 
                 WHERE a.status = 'published'`;
    let params = [];
    if (tag && tag !== 'all') {
        query += ` AND a.tag = ?`;
        params.push(tag);
    }
    query += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    
    db.all(query, params, (err, articles) => {
        if (err) {
            console.error('Ошибка загрузки статей:', err);
            return res.status(500).json({ error: 'Ошибка загрузки статей' });
        }
        db.get(`SELECT COUNT(*) as total FROM media_articles WHERE status = 'published'`, (err, count) => {
            res.json({
                articles: articles || [],
                total: count?.total || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// GET одна статья по слагу (ЧПУ)
app.get('/api/media/articles/:slug', (req, res) => {
    const { slug } = req.params;
    db.get(`SELECT a.*, u.name as author_name, u.avatar as author_avatar, u.user_id as author_uid 
            FROM media_articles a 
            LEFT JOIN users u ON a.author_id = u.id 
            WHERE a.slug = ? AND a.status = 'published'`, [slug], (err, article) => {
        if (err || !article) {
            return res.status(404).json({ error: 'Статья не найдена' });
        }
        // Увеличиваем счетчик просмотров
        db.run(`UPDATE media_articles SET views = views + 1 WHERE id = ?`, [article.id]);
        res.json(article);
    });
});

app.get('/api/admin/bans', isAdmin, (req, res) => {
    db.all(
        `SELECT 
            u.id as user_id,
            u.user_id as user_uid,
            u.name as user_name,
            u.status,
            u.balance,
            u.created_at,
            u.warnings,
            u.avatar,
            u.role,
            al.admin_id,
            al.admin_name,
            al.details as ban_reason,
            al.created_at as blocked_at
        FROM users u
        LEFT JOIN admin_logs al ON al.target_user_id = u.id AND al.action = 'block_user'
        WHERE u.status = 'blocked'
        ORDER BY u.created_at DESC`,
        (err, rows) => {
            if (err) {
                console.error('Ошибка получения бан-листа:', err);
                return res.status(500).json({ error: 'Ошибка получения бан-листа' });
            }
            
            // Если нет заблокированных пользователей, возвращаем пустой массив
            if (!rows || rows.length === 0) {
                return res.json([]);
            }
            
            // Группируем по пользователю, чтобы взять последний лог блокировки
            const bansMap = {};
            rows.forEach(row => {
                if (!bansMap[row.user_id] || new Date(row.blocked_at) > new Date(bansMap[row.user_id].blocked_at)) {
                    bansMap[row.user_id] = row;
                }
            });
            
            const result = Object.values(bansMap).map(row => ({
                user_id: row.user_id,
                user_uid: row.user_uid,
                user_name: row.user_name,
                status: row.status,
                balance: row.balance,
                created_at: row.created_at,
                warnings: row.warnings,
                avatar: row.avatar,
                role: row.role,
                admin_id: row.admin_id,
                admin_name: row.admin_name || 'Система',
                reason: row.ban_reason ? row.ban_reason.replace(/^\[Блокировка\]\s*/, '').trim() : 'Причина не указана',
                blocked_at: row.blocked_at || row.created_at
            }));
            
            res.json(result);
        }
    );
});

// ====== ДОПОЛНИТЕЛЬНЫЙ ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ ЛОГОВ =====
app.get('/api/admin/logs', isAdmin, (req, res) => {
    const { user_id, action, limit = 100 } = req.query;
    let query = `SELECT * FROM admin_logs WHERE 1=1`;
    const params = [];
    
    if (user_id) {
        query += ` AND (admin_id = ? OR target_user_id = ?)`;
        params.push(user_id, user_id);
    }
    if (action) {
        query += ` AND action = ?`;
        params.push(action);
    }
    query += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    
    db.all(query, params, (err, logs) => {
        if (err) {
            console.error('Ошибка получения логов:', err);
            return res.status(500).json({ error: 'Ошибка получения логов' });
        }
        res.json(logs || []);
    });
});

// POST создание статьи (только для редакторов)
app.post('/api/media/articles', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    // Получаем роль пользователя
    const user = await new Promise((resolve) => {
        db.get(`SELECT id, name, role FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
            resolve(row);
        });
    });

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    // Проверяем права (роли из списка)
    const editorRoles = [
        'head_beta_testers', 'head_cooperation', 'head_marketing',
        'head_support', 'head_moderation', 'tech_admin', 'developer',
        'tech_lead', 'ciso', 'ceo', 'board_of_directors'
    ];

    if (!editorRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав для создания статьи' });
    }

    const { title, content, tag } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: 'Заголовок и содержание обязательны' });
    }

    // Генерируем уникальный слаг
    let slug = generateSlug(title);
    // Проверяем уникальность
    const existing = await new Promise((resolve) => {
        db.get(`SELECT id FROM media_articles WHERE slug = ?`, [slug], (err, row) => {
            resolve(row);
        });
    });
    if (existing) {
        slug = slug + '-' + Date.now().toString(36);
    }

    db.run(
        `INSERT INTO media_articles (slug, title, content, tag, author_id, author_name) VALUES (?, ?, ?, ?, ?, ?)`,
        [slug, title, content, tag || 'Новости', user.id, user.name],
        function(err) {
            if (err) {
                console.error('Ошибка создания статьи:', err);
                return res.status(500).json({ error: 'Ошибка создания статьи' });
            }
            // Логируем действие
            logAdminAction(req.session.userId, 'create_article', `Создана статья: ${title}`);
            res.json({
                success: true,
                id: this.lastID,
                slug: slug,
                url: `/media/${slug}`
            });
        }
    );
});

// PUT обновление статьи (только автор или редактор)
app.put('/api/media/articles/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const user = await new Promise((resolve) => {
        db.get(`SELECT id, name, role FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
            resolve(row);
        });
    });

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const editorRoles = [
        'head_beta_testers', 'head_cooperation', 'head_marketing',
        'head_support', 'head_moderation', 'tech_admin', 'developer',
        'tech_lead', 'ciso', 'ceo', 'board_of_directors'
    ];
    const isEditor = editorRoles.includes(user.role);

    // Проверяем, что статья существует и пользователь имеет права
    const article = await new Promise((resolve) => {
        db.get(`SELECT id, author_id FROM media_articles WHERE id = ?`, [req.params.id], (err, row) => {
            resolve(row);
        });
    });

    if (!article) {
        return res.status(404).json({ error: 'Статья не найдена' });
    }

    if (article.author_id !== user.id && !isEditor) {
        return res.status(403).json({ error: 'Нет прав на редактирование' });
    }

    const { title, content, tag, status } = req.body;
    const updates = [];
    const params = [];

    if (title) { updates.push('title = ?'); params.push(title); }
    if (content) { updates.push('content = ?'); params.push(content); }
    if (tag) { updates.push('tag = ?'); params.push(tag); }
    if (status) { updates.push('status = ?'); params.push(status); }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'Нет данных для обновления' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    db.run(`UPDATE media_articles SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) {
            console.error('Ошибка обновления статьи:', err);
            return res.status(500).json({ error: 'Ошибка обновления статьи' });
        }
        logAdminAction(req.session.userId, 'update_article', `Обновлена статья #${req.params.id}`);
        res.json({ success: true });
    });
});

// DELETE удаление статьи (только редакторы)
app.delete('/api/media/articles/:id', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    const user = await new Promise((resolve) => {
        db.get(`SELECT id, role FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
            resolve(row);
        });
    });

    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const editorRoles = [
        'head_beta_testers', 'head_cooperation', 'head_marketing',
        'head_support', 'head_moderation', 'tech_admin', 'developer',
        'tech_lead', 'ciso', 'ceo', 'board_of_directors'
    ];

    if (!editorRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Недостаточно прав для удаления статьи' });
    }

    db.run(`DELETE FROM media_articles WHERE id = ?`, [req.params.id], function(err) {
        if (err) {
            console.error('Ошибка удаления статьи:', err);
            return res.status(500).json({ error: 'Ошибка удаления статьи' });
        }
        logAdminAction(req.session.userId, 'delete_article', `Удалена статья #${req.params.id}`);
        res.json({ success: true });
    });
});

// ============ СТРАНИЦА СТАТЬИ (ЧПУ) ============
app.get('/media/:slug', (req, res) => {
    // Проверяем, существует ли статья
    db.get(`SELECT id, title, status FROM media_articles WHERE slug = ?`, [req.params.slug], (err, article) => {
        if (err || !article || article.status !== 'published') {
            return res.status(404).sendFile(path.join(__dirname, 'client', '404.html'));
        }
        res.sendFile(path.join(__dirname, 'client', 'article.html'));
    });
});




app.post('/api/check-user', (req, res) => {
    const { field, value } = req.body;
    let query = '';
    switch(field) {
        case 'name': query = `SELECT id FROM users WHERE name = ?`; break;
        case 'email': query = `SELECT id FROM users WHERE email = ?`; break;
        case 'phone': query = `SELECT id FROM users WHERE phone = ?`; break;
        default: return res.status(400).json({ error: 'Неверное поле' });
    }
    db.get(query, [value], (err, user) => res.json({ exists: !!user }));
});

app.put('/api/profile', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { name, phone, about, location } = req.body;
    db.run(`UPDATE users SET name = ?, phone = ?, about = ?, location = ? WHERE id = ?`,
        [name, phone || null, about || null, location || null, req.session.userId], (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            req.session.userName = name;
            res.json({ success: true });
        });
});

app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    db.run(`UPDATE users SET avatar = ? WHERE id = ?`, [avatarUrl, req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        res.json({ success: true, avatar: avatarUrl });
    });
});

// ============ API СИСТЕМЫ ПОВЫШЕНИЙ ============
app.get('/api/promotion/available-roles', (req, res) => {
    res.json([
        { value: 'beta_tester', name: 'Бета-Тестер', level: 20 },
        { value: 'support_trainee', name: 'Стажер Поддержки', level: 30 },
        { value: 'tech_support', name: 'Тех. Поддержка', level: 35 },
        { value: 'pro_support', name: 'Проф. Поддержка', level: 40 },
        { value: 'recruiter', name: 'Рекрутер', level: 60 },
        { value: 'smm_manager', name: 'Смм Менеджер', level: 70 },
        { value: 'pr_manager', name: 'Пиар Менеджер', level: 75 },
        { value: 'senior_pr_manager', name: 'Старший Пиар Менеджер', level: 80 },
        { value: 'content_label_moderator', name: 'Модератор разметки контента', level: 86 },
        { value: 'content_moderator', name: 'Модератор Контента', level: 87 },
        { value: 'senior_content_label_moderator', name: 'Старший Модератор разметки контента', level: 88 },
        { value: 'senior_content_moderator', name: 'Старший Модератор контента', level: 89 },
        { value: 'head_beta_testers', name: 'Руководитель Бета-Тестеров', level: 90 },
        { value: 'head_cooperation', name: 'Руководитель Сотрудничеств', level: 91 },
        { value: 'head_marketing', name: 'Руководитель Маркетинга и RP', level: 92 },
        { value: 'head_support', name: 'Руководитель Поддержки', level: 93 },
        { value: 'head_moderation', name: 'Руководитель Модерации', level: 94 },
        { value: 'tech_admin', name: 'Тех. Администратор', level: 95 },
        { value: 'developer', name: 'Разработчики', level: 96 },
        { value: 'tech_lead', name: 'Ведущий разработчик', level: 97 },
        { value: 'ciso', name: 'Глава Безопасности', level: 98 },
        { value: 'ceo', name: 'Исполнительный Директор', level: 99 },
        { value: 'board_of_directors', name: 'Совет Директоров', level: 100 }
    ]);
});

app.get('/api/promotion/check', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        const nextRole = getNextRole(user.role);
        res.json({ can_promote: !!nextRole, next_role: nextRole, current_role: user.role });
    });
});

// ============ API БЕТА-ТЕСТИНГА ============
// Баг-репорты
app.get('/api/bug-reports', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { status, priority, product_id, limit = 50, offset = 0 } = req.query;
    let query = `SELECT br.*, u.name as author_name, p.name as product_name FROM bug_reports br 
                 LEFT JOIN users u ON br.user_id = u.id LEFT JOIN products p ON br.product_id = p.id WHERE 1=1`;
    let params = [];
    if (status && status !== 'all') { query += ` AND br.status = ?`; params.push(status); }
    if (priority && priority !== 'all') { query += ` AND br.priority = ?`; params.push(priority); }
    if (product_id) { query += ` AND br.product_id = ?`; params.push(product_id); }
    query += ` ORDER BY br.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    db.all(query, params, (err, reports) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        db.get(`SELECT COUNT(*) as total FROM bug_reports`, (err, count) => {
            res.json({ reports: reports || [], total: count?.total || 0 });
        });
    });
});

app.get('/api/bug-reports/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT br.*, u.name as author_name, u.avatar as author_avatar, p.name as product_name
            FROM bug_reports br LEFT JOIN users u ON br.user_id = u.id LEFT JOIN products p ON br.product_id = p.id WHERE br.id = ?`, [req.params.id], (err, report) => {
        if (err || !report) return res.status(404).json({ error: 'Отчёт не найден' });
        db.all(`SELECT * FROM report_comments WHERE report_id = ? ORDER BY created_at ASC`, [req.params.id], (err, comments) => {
            db.all(`SELECT * FROM report_attachments WHERE report_id = ?`, [req.params.id], (err, attachments) => {
                db.all(`SELECT * FROM report_devices WHERE report_id = ?`, [req.params.id], (err, devices) => {
                    res.json({ ...report, comments: comments || [], attachments: attachments || [], devices: devices || [] });
                });
            });
        });
    });
});

app.post('/api/bug-reports', upload.array('attachments', 5), (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, steps_to_reproduce, actual_result, expected_result, priority, issue_type, product_id, product_version, platform, tags, devices } = req.body;
    if (!title) return res.status(400).json({ error: 'Заголовок обязателен' });
    const reportNumber = generateReportNumber();
    db.run(`INSERT INTO bug_reports (report_number, user_id, title, description, steps_to_reproduce, actual_result, expected_result, priority, issue_type, product_id, product_version, platform, tags, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [reportNumber, req.session.userId, title, description || '', steps_to_reproduce || '', actual_result || '', expected_result || '', priority || 'medium', issue_type || '', product_id || null, product_version || '', platform || '', tags || ''],
        function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания отчёта' });
            const reportId = this.lastID;
            if (req.files && req.files.length) {
                req.files.forEach(file => {
                    db.run(`INSERT INTO report_attachments (report_id, filename, filepath, filesize, uploaded_by) VALUES (?, ?, ?, ?, ?)`,
                        [reportId, file.originalname, `/uploads/attachments/${file.filename}`, file.size, req.session.userId]);
                });
            }
            if (devices) {
                try {
                    const devicesArr = JSON.parse(devices);
                    devicesArr.forEach(device => {
                        db.run(`INSERT INTO report_devices (report_id, device_type, device_os) VALUES (?, ?, ?)`,
                            [reportId, device.type || 'desktop', device.os || 'Windows']);
                    });
                } catch(e) {}
            }
            updateUserStats(req.session.userId, 'reports_processed', 1);
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'reports_created');
            }, 500);
            res.json({ success: true, report_id: reportId, report_number: reportNumber });
        });
});

app.put('/api/bug-reports/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, steps_to_reproduce, actual_result, expected_result, priority, status, issue_type, product_id, product_version, platform, tags } = req.body;
    db.run(`UPDATE bug_reports SET title = ?, description = ?, steps_to_reproduce = ?, actual_result = ?, expected_result = ?, priority = ?, status = ?, issue_type = ?, product_id = ?, product_version = ?, platform = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, description, steps_to_reproduce, actual_result, expected_result, priority, status, issue_type, product_id, product_version, platform, tags, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            if (status === 'fixed') {
                db.run(`UPDATE bug_reports SET resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?`, [req.session.userId, req.params.id]);
                updateUserStats(req.session.userId, 'bugs_fixed', 1);
                setTimeout(() => {
                    checkAndUnlockAchievements(req.session.userId, 'reports_fixed');
                }, 500);
            }
            res.json({ success: true });
        });
});

app.post('/api/bug-reports/:id/comments', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Комментарий не может быть пустым' });
    db.run(`INSERT INTO report_comments (report_id, user_id, comment) VALUES (?, ?, ?)`, [req.params.id, req.session.userId, comment], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка добавления комментария' });
        updateUserStats(req.session.userId, 'messages_count', 1);
        setTimeout(() => {
            checkAndUnlockAchievements(req.session.userId, 'comments_count');
        }, 500);
        res.json({ success: true, comment_id: this.lastID });
    });
});

app.get('/api/bug-reports/similar', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title } = req.query;
    if (!title || title.length < 3) return res.json({ reports: [] });
    db.all(`SELECT id, report_number, title, status, priority, created_at FROM bug_reports WHERE title LIKE ? OR description LIKE ? LIMIT 10`, [`%${title}%`, `%${title}%`], (err, reports) => {
        if (err) return res.status(500).json({ error: 'Ошибка поиска' });
        res.json({ reports: reports || [] });
    });
});

app.get('/api/my-reports', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT br.*, p.name as product_name FROM bug_reports br LEFT JOIN products p ON br.product_id = p.id WHERE br.user_id = ? ORDER BY br.created_at DESC`, [req.session.userId], (err, reports) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(reports || []);
    });
});

// Тест-кейсы
app.get('/api/test-cases', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { status, product_id, limit = 50 } = req.query;
    let query = `SELECT tc.*, u.name as author_name, p.name as product_name FROM test_cases tc 
                 LEFT JOIN users u ON tc.author_id = u.id LEFT JOIN products p ON tc.product_id = p.id WHERE 1=1`;
    let params = [];
    if (status && status !== 'all') { query += ` AND tc.status = ?`; params.push(status); }
    if (product_id) { query += ` AND tc.product_id = ?`; params.push(product_id); }
    query += ` ORDER BY tc.created_at DESC LIMIT ?`;
    params.push(parseInt(limit));
    db.all(query, params, (err, testCases) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(testCases || []);
    });
});

app.get('/api/test-cases/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT tc.*, u.name as author_name, p.name as product_name FROM test_cases tc 
            LEFT JOIN users u ON tc.author_id = u.id LEFT JOIN products p ON tc.product_id = p.id WHERE tc.id = ?`, [req.params.id], (err, testCase) => {
        if (err || !testCase) return res.status(404).json({ error: 'Тест-кейс не найден' });
        db.all(`SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY created_at DESC`, [req.params.id], (err, runs) => {
            res.json({ ...testCase, runs: runs || [] });
        });
    });
});

app.post('/api/test-cases', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, preconditions, steps, expected_result, priority, product_id, tags } = req.body;
    if (!title || !steps || !expected_result) return res.status(400).json({ error: 'Заполните обязательные поля' });
    db.run(`INSERT INTO test_cases (title, description, preconditions, steps, expected_result, priority, product_id, author_id, tags, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [title, description || '', preconditions || '', steps, expected_result, priority || 'medium', product_id || null, req.session.userId, tags || ''],
        function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания тест-кейса' });
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'testcases_created');
            }, 500);
            res.json({ success: true, test_case_id: this.lastID });
        });
});

app.put('/api/test-cases/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, preconditions, steps, expected_result, priority, status, product_id, tags } = req.body;
    db.run(`UPDATE test_cases SET title = ?, description = ?, preconditions = ?, steps = ?, expected_result = ?, priority = ?, status = ?, product_id = ?, tags = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, description, preconditions, steps, expected_result, priority, status, product_id, tags, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            res.json({ success: true });
        });
});

app.post('/api/test-cases/:id/run', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { status, comment } = req.body;
    if (!status) return res.status(400).json({ error: 'Укажите статус выполнения' });
    db.run(`INSERT INTO test_runs (test_case_id, executed_by, status, comment) VALUES (?, ?, ?, ?)`,
        [req.params.id, req.session.userId, status, comment || ''], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка сохранения результата' });
            db.run(`UPDATE test_cases SET status = ?, last_run = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id]);
            if (status === 'passed') updateUserStats(req.session.userId, 'successful_deals', 1);
            else if (status === 'failed') updateUserStats(req.session.userId, 'bugs_fixed', 1);
            res.json({ success: true });
        });
});

// Чек-листы
app.get('/api/checklists', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT c.*, u.name as author_name, p.name as product_name FROM checklists c 
            LEFT JOIN users u ON c.author_id = u.id LEFT JOIN products p ON c.product_id = p.id ORDER BY c.created_at DESC`, (err, checklists) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(checklists || []);
    });
});

app.get('/api/checklists/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT * FROM checklists WHERE id = ?`, [req.params.id], (err, checklist) => {
        if (err || !checklist) return res.status(404).json({ error: 'Чек-лист не найден' });
        res.json(checklist);
    });
});

app.post('/api/checklists', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, items, product_id } = req.body;
    if (!title || !items) return res.status(400).json({ error: 'Заполните обязательные поля' });
    db.run(`INSERT INTO checklists (title, description, items, product_id, author_id, status) VALUES (?, ?, ?, ?, ?, 'pending')`,
        [title, description || '', JSON.stringify(items), product_id || null, req.session.userId], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания чек-листа' });
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'checklists_created');
            }, 500);
            res.json({ success: true, checklist_id: this.lastID });
        });
});

app.put('/api/checklists/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, items, status } = req.body;
    db.run(`UPDATE checklists SET title = ?, description = ?, items = ?, status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id = ?`,
        [title, description, JSON.stringify(items), status, status, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            if (status === 'completed') {
                setTimeout(() => {
                    checkAndUnlockAchievements(req.session.userId, 'checklists_completed');
                }, 500);
            }
            res.json({ success: true });
        });
});

app.get('/api/blocked-info', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    db.get(
        `SELECT id, user_id, name, status, balance, role, about, warnings, created_at, last_login 
         FROM users WHERE id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            if (user.status !== 'blocked') {
                return res.status(403).json({ 
                    error: 'Пользователь не заблокирован',
                    redirect: '/'
                });
            }

            // Ищем ПОСЛЕДНИЙ лог блокировки ДЛЯ ЭТОГО ПОЛЬЗОВАТЕЛЯ
            db.get(
                `SELECT details, created_at FROM admin_logs 
                 WHERE action = 'block_user' AND admin_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [req.session.userId],
                (err, blockLog) => {
                    if (err) {
                        console.error('Ошибка получения лога блокировки:', err);
                    }

                    // Ищем ПОСЛЕДНИЙ комментарий сотрудника ДЛЯ ЭТОГО ПОЛЬЗОВАТЕЛЯ
                    db.get(
                        `SELECT details, created_at FROM admin_logs 
                         WHERE action IN ('block_user', 'warn_user') AND admin_id = ?
                         ORDER BY created_at DESC LIMIT 1`,
                        [req.session.userId],
                        (err, staffComment) => {
                            if (err) {
                                console.error('Ошибка получения комментария:', err);
                            }

                            // Парсим причину блокировки из лога
                            let reason = 'Нарушение правил платформы. Подробности уточняйте в поддержке.';
                            let logText = null;
                            let staffCommentText = null;
                            
                            if (blockLog && blockLog.details) {
                                const details = blockLog.details;
                                // Убираем "[Блокировка] " из начала
                                reason = details.replace(/^\[Блокировка\]\s*/, '');
                                // Если есть "Комментарий сотрудника:", оставляем только причину
                                const commentIndex = reason.indexOf('Комментарий сотрудника:');
                                if (commentIndex !== -1) {
                                    reason = reason.substring(0, commentIndex).trim();
                                }
                                logText = details;
                            }

                            // Берём только последний комментарий сотрудника
                            if (staffComment && staffComment.details) {
                                const details = staffComment.details;
                                // Извлекаем только комментарий сотрудника
                                const commentMatch = details.match(/Комментарий сотрудника:\s*(.+?)(?:\n|$)/);
                                if (commentMatch) {
                                    staffCommentText = commentMatch[1].trim();
                                } else {
                                    staffCommentText = details;
                                }
                            }

                            // Формируем ответ
                            const response = {
                                username: user.name,
                                user_id: user.user_id,
                                status: user.status,
                                balance: user.balance || 0,
                                
                                reason: reason,
                                
                                staff_comment: staffCommentText || null,
                                
                                log: logText || null,
                                
                                finance: {
                                    hold_days: 180,
                                    review_date: blockLog?.created_at 
                                        ? new Date(blockLog.created_at).toLocaleString('ru-RU', {
                                            day: 'numeric',
                                            month: 'long',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })
                                        : 'Дата не указана',
                                    balance: user.balance || 0,
                                    currency: 'RUB'
                                },
                                
                                support_url: '/support',
                                support_button_text: 'Написать в поддержку',
                                
                                footer_note: 'Обычно отвечаем за 2 дня, но постараемся быстрее.<br>Просим вас не писать отзывов и не начинать публичное обсуждение до окончания разбирательства.<br><br>Аккаунт зарегистрирован: ' + new Date(user.created_at).toLocaleString('ru-RU', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric'
                                })
                            };

                            res.json(response);
                        }
                    );
                }
            );
        }
    );
});

// Вспомогательная функция для форматирования даты
function formatDate(dateStr) {
    if (!dateStr) return 'Дата не указана';
    const date = new Date(dateStr);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 
                   'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function checkBlocked(req, res, next) {
    if (!req.session.userId) {
        return next();
    }

    db.get(
        `SELECT status FROM users WHERE id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return next();
            }

            if (user.status === 'blocked') {
                // Если пользователь заблокирован и пытается зайти на защищённые страницы
                const blockedPaths = ['/', '/marketplace', '/profile', '/messages', '/beta-testing', '/achievements'];
                const currentPath = req.path;
                
                // Проверяем, не находится ли он уже на странице блокировки
                if (currentPath === '/account/blocked') {
                    return next();
                }

                // Если пытается зайти куда-то ещё, перенаправляем на страницу блокировки
                if (blockedPaths.some(path => currentPath === path || currentPath.startsWith(path + '/'))) {
                    return res.redirect('/account/blocked');
                }
            }

            next();
        }
    );
}

// Подключаем middleware ко всем роутам (кроме статики и API)
app.use((req, res, next) => {
    // Пропускаем API запросы и статику
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        return next();
    }
    checkBlocked(req, res, next);
});
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.get('/api/admin/verification/types', isAdmin, (req, res) => {
    const verificationTypes = {
        1: { id: 1, title: 'Подтверждённый аккаунт', badge: 'Подтверждённый аккаунт', icon: '../assets/gal1.png', category: 'Базовые' },
        2: { id: 2, title: 'Бизнес-аккаунт', badge: 'Бизнес-аккаунт', icon: '../assets/gal2.png', category: 'Базовые' },
        3: { id: 3, title: 'Медиа-партнёр', badge: 'Медиа-партнёр', icon: '../assets/gal3.png', category: 'Партнёрские' },
        4: { id: 4, title: 'Амбассадор', badge: 'Амбассадор', icon: '../assets/gal4.png', category: 'Партнёрские' },
        5: { id: 5, title: 'Медиа-партнёр', badge: 'Медиа-партнёр', icon: '../assets/gal5.png', category: 'Партнёрские' },
        6: { id: 6, title: 'Начинающий продавец', badge: 'Начинающий продавец', icon: '../assets/gal6.png', category: 'Продавцы' },
        7: { id: 7, title: 'Опытный продавец', badge: 'Опытный продавец', icon: '../assets/gal7.png', category: 'Продавцы' },
        8: { id: 8, title: 'Топ-продавец', badge: 'Топ-продавец', icon: '../assets/gal8.png', category: 'Продавцы' },
        9: { id: 9, title: 'Золотой продавец', badge: 'Золотой продавец', icon: '../assets/gal9.png', category: 'Продавцы' },
        10: { id: 10, title: 'Платиновый продавец', badge: 'Платиновый продавец', icon: '../assets/gal10.png', category: 'Продавцы' },
        11: { id: 11, title: 'Кибер-защитник', badge: 'Кибер-защитник', icon: '../assets/gal11.png', category: 'Специальные' },
        12: { id: 12, title: 'NULL Fest Участник', badge: 'NULL Fest Участник', icon: '../assets/gal12.png', category: 'Специальные' },
        14: { id: 14, title: 'Ранний сторонник', badge: 'Ранний сторонник', icon: '../assets/gal16.png', category: 'Специальные' },
        17: { id: 17, title: 'Выпускник модераторской программы', badge: 'Выпускник модераторской программы', icon: '../assets/gal17.png', category: 'Специальные' },
        18: { id: 18, title: 'Контрибьютор', badge: 'Контрибьютор', icon: '../assets/gal18.png', category: 'Специальные' },
        19: { id: 19, title: 'Системный Аккаунт', badge: 'Системный Аккаунт', icon: '../assets/gal19.png', category: 'Система' }	
    };
    res.json(Object.values(verificationTypes));
});

// Получение текущего статуса верификации пользователя
app.get('/api/admin/verification/user/:userId', isAdmin, (req, res) => {
    const { userId } = req.params;
    db.get(
        `SELECT verified FROM users WHERE id = ?`,
        [userId],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            res.json({ verified: user.verified || 0 });
        }
    );
});

// Выдача верификации пользователю
app.post('/api/admin/verification/grant', isAdmin, (req, res) => {
    const { user_id, verification_type } = req.body;
    
    if (!user_id || !verification_type) {
        return res.status(400).json({ error: 'Укажите пользователя и тип верификации' });
    }
    
    db.get(
        `SELECT name, verified FROM users WHERE id = ?`,
        [user_id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            // Проверяем, не установлена ли уже такая же или более высокая верификация
            if (user.verified === verification_type) {
                return res.status(400).json({ error: 'У пользователя уже установлена такая верификация' });
            }
            
            db.run(
                `UPDATE users SET verified = ? WHERE id = ?`,
                [verification_type, user_id],
                function(err) {
                    if (err) {
                        console.error('Ошибка обновления верификации:', err);
                        return res.status(500).json({ error: 'Ошибка обновления верификации' });
                    }
                    
                    // Логируем действие
                    const verificationTypes = {
                        1: 'Подтверждённый аккаунт',
                        2: 'Бизнес-аккаунт',
                        3: 'Медиа-партнёр',
                        4: 'Амбассадор',
                        5: 'Блогер-партнёр',
                        6: 'Начинающий продавец',
                        7: 'Опытный продавец',
                        8: 'Топ-продавец',
                        9: 'Золотой продавец',
                        10: 'Платиновый продавец',
                        11: 'Кибер-защитник',
                        12: 'NULL Fest Участник',
                        14: 'Ранний сторонник'
                    };
                    
                    logAdminAction(
                        req.session.userId, 
                        'grant_verification', 
                        `Пользователь ${user.name} получил верификацию: ${verificationTypes[verification_type] || verification_type}`
                    );
                    
                    res.json({ 
                        success: true, 
                        message: `Верификация успешно выдана`,
                        verified: verification_type
                    });
                }
            );
        }
    );
});

// Снятие верификации
app.post('/api/admin/verification/revoke', isAdmin, (req, res) => {
    const { user_id } = req.body;
    
    if (!user_id) {
        return res.status(400).json({ error: 'Укажите пользователя' });
    }
    
    db.get(
        `SELECT name, verified FROM users WHERE id = ?`,
        [user_id],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }
            
            if (!user.verified || user.verified === 0) {
                return res.status(400).json({ error: 'У пользователя нет активной верификации' });
            }
            
            db.run(
                `UPDATE users SET verified = 0 WHERE id = ?`,
                [user_id],
                function(err) {
                    if (err) {
                        console.error('Ошибка снятия верификации:', err);
                        return res.status(500).json({ error: 'Ошибка снятия верификации' });
                    }
                    
                    logAdminAction(
                        req.session.userId, 
                        'revoke_verification', 
                        `Снята верификация с пользователя ${user.name}`
                    );
                    
                    res.json({ 
                        success: true, 
                        message: 'Верификация снята',
                        verified: 0
                    });
                }
            );
        }
    );
});

// Получение списка верифицированных пользователей
app.get('/api/admin/verification/users', isAdmin, (req, res) => {
    db.all(
        `SELECT id, user_id, name, email, avatar, verified, role, status FROM users WHERE verified > 0 ORDER BY verified ASC`,
        (err, users) => {
            if (err) {
                console.error('Ошибка получения верифицированных пользователей:', err);
                return res.status(500).json({ error: 'Ошибка загрузки' });
            }
            res.json(users || []);
        }
    );
});

// Вспомогательная функция для форматирования комментариев сотрудников
function formatStaffComments(comments) {
    if (!comments || comments.length === 0) {
        return 'Комментарии сотрудников отсутствуют.';
    }
    
    return comments.map(c => {
        const actionMap = {
            'block_user': 'Блокировка',
            'warn_user': 'Предупреждение',
            'report': 'Жалоба',
            'ticket': 'Тикет'
        };
        const action = actionMap[c.action] || c.action;
        return `[${formatDate(c.created_at)}] ${action}: ${c.details}`;
    }).join('\n');
}

// Дополнительный эндпоинт для проверки статуса пользователя
app.get('/api/user-status', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }

    db.get(
        'SELECT status, name, user_id FROM users WHERE id = ?',
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({ error: 'Пользователь не найден' });
            }

            res.json({
                status: user.status,
                name: user.name,
                user_id: user.user_id
            });
        }
    );
});



// Эндпоинт для получения информации о блокировке по имени пользователя (для админов)
app.get('/api/admin/blocked-user/:username', isAdmin, (req, res) => {
    const { username } = req.params;

    db.get(
        `SELECT id, user_id, name, status, balance, created_at, about, warnings 
         FROM users WHERE name = ? AND status = 'blocked'`,
        [username],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Ошибка сервера' });
            }

            if (!user) {
                return res.status(404).json({ error: 'Заблокированный пользователь не найден' });
            }

            // Получаем историю блокировок
            db.all(
                `SELECT action, details, created_at FROM admin_logs 
                 WHERE admin_id = ? 
                 ORDER BY created_at DESC LIMIT 10`,
                [user.id],
                (err, logs) => {
                    if (err) {
                        console.error('Ошибка получения логов:', err);
                    }

                    res.json({
                        user: {
                            id: user.id,
                            user_id: user.user_id,
                            name: user.name,
                            balance: user.balance || 0,
                            created_at: user.created_at,
                            warnings: user.warnings || 0
                        },
                        history: logs || [],
                        block_reason: logs?.find(l => l.action === 'block_user')?.details || 'Причина не указана'
                    });
                }
            );
        }
    );
});

app.get('/account/blocked', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/auth');
    }
    
    // Проверяем, действительно ли пользователь заблокирован
    db.get(
        `SELECT status FROM users WHERE id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err || !user) {
                return res.redirect('/');
            }
            
            if (user.status !== 'blocked') {
                return res.redirect('/');
            }
            
            res.sendFile(path.join(__dirname, 'client', 'blocked.html'));
        }
    );
});

app.post('/api/admin/log', isAdmin, (req, res) => {
    const { action, details, target_user_id } = req.body;
    if (!action) return res.status(400).json({ error: 'Укажите действие' });
    
    db.run(
        `INSERT INTO admin_logs (admin_id, admin_name, action, details) VALUES (?, ?, ?, ?)`,
        [req.session.userId, req.session.userName || 'Admin', action, details || ''],
        function(err) {
            if (err) {
                console.error('Ошибка логирования:', err);
                return res.status(500).json({ error: 'Ошибка логирования' });
            }
            res.json({ success: true });
        }
    );
});

// Продукты
app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY name`, (err, products) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(products || []);
    });
});

app.get('/api/products/:id', (req, res) => {
    db.get(`SELECT * FROM products WHERE id = ?`, [req.params.id], (err, product) => {
        if (err || !product) return res.status(404).json({ error: 'Продукт не найден' });
        res.json(product);
    });
});

app.post('/api/products', isAdmin, (req, res) => {
    const { name, description, version, status } = req.body;
    if (!name || !version) return res.status(400).json({ error: 'Заполните обязательные поля' });
    db.run(`INSERT INTO products (name, description, version, status, owner_id) VALUES (?, ?, ?, ?, ?)`,
        [name, description || '', version, status || 'beta', req.session.userId], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Продукт с таким названием уже существует' });
                return res.status(500).json({ error: 'Ошибка создания продукта' });
            }
            logAdminAction(req.session.userId, 'create_product', `Создан продукт ${name}`);
            res.json({ success: true, product_id: this.lastID });
        });
});

app.put('/api/products/:id', isAdmin, (req, res) => {
    const { name, description, version, status } = req.body;
    db.run(`UPDATE products SET name = ?, description = ?, version = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [name, description, version, status, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            logAdminAction(req.session.userId, 'update_product', `Обновлён продукт ${name}`);
            res.json({ success: true });
        });
});

app.delete('/api/products/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM products WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        logAdminAction(req.session.userId, 'delete_product', `Удалён продукт ${req.params.id}`);
        res.json({ success: true });
    });
});

// Участники бета-тестирования
app.get('/api/beta-testers', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT bt.*, u.name, u.avatar, u.email, u.created_at as user_created_at FROM beta_testers bt LEFT JOIN users u ON bt.user_id = u.id ORDER BY bt.joined_at DESC`, (err, testers) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(testers || []);
    });
});

app.post('/api/beta-testers', isAdmin, (req, res) => {
    const { user_id, role } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Укажите пользователя' });
    db.run(`INSERT OR IGNORE INTO beta_testers (user_id, role) VALUES (?, ?)`, [user_id, role || 'tester'], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка добавления' });
        logAdminAction(req.session.userId, 'add_beta_tester', `Добавлен тестировщик ${user_id}`);
        res.json({ success: true });
    });
});

app.put('/api/beta-testers/:userId', isAdmin, (req, res) => {
    const { role, is_active } = req.body;
    db.run(`UPDATE beta_testers SET role = ?, is_active = ? WHERE user_id = ?`, [role, is_active, req.params.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        res.json({ success: true });
    });
});

app.get('/api/beta-stats', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT COUNT(*) as total_reports FROM bug_reports`, (err, reports) => {
        db.get(`SELECT COUNT(*) as open_reports FROM bug_reports WHERE status = 'open'`, (err, openReports) => {
            db.get(`SELECT COUNT(*) as fixed_reports FROM bug_reports WHERE status = 'fixed'`, (err, fixedReports) => {
                db.get(`SELECT COUNT(*) as total_testcases FROM test_cases`, (err, testCases) => {
                    db.get(`SELECT COUNT(*) as passed_testcases FROM test_cases WHERE status = 'passed'`, (err, passed) => {
                        db.get(`SELECT COUNT(*) as total_checklists FROM checklists`, (err, checklists) => {
                            db.get(`SELECT COUNT(*) as completed_checklists FROM checklists WHERE status = 'completed'`, (err, completed) => {
                                db.get(`SELECT COUNT(*) as active_testers FROM beta_testers WHERE is_active = 1`, (err, activeTesters) => {
                                    db.all(`SELECT priority, COUNT(*) as count FROM bug_reports GROUP BY priority`, (err, priorityStats) => {
                                        db.all(`SELECT DATE(created_at) as date, COUNT(*) as count FROM bug_reports WHERE created_at >= date('now', '-7 days') GROUP BY DATE(created_at)`, (err, trend) => {
                                            res.json({
                                                total_reports: reports?.total_reports || 0,
                                                open_reports: openReports?.open_reports || 0,
                                                fixed_reports: fixedReports?.fixed_reports || 0,
                                                total_testcases: testCases?.total_testcases || 0,
                                                passed_testcases: passed?.passed_testcases || 0,
                                                total_checklists: checklists?.total_checklists || 0,
                                                completed_checklists: completed?.completed_checklists || 0,
                                                active_testers: activeTesters?.active_testers || 0,
                                                priority_stats: priorityStats || [],
                                                trend: trend || []
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ============ API МАРКЕТПЛЕЙСА ============
app.get('/api/games', (req, res) => {
    db.all(`SELECT DISTINCT game_name FROM game_categories ORDER BY game_name`, (err, games) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (!games || games.length === 0) return res.json([]);
        const result = [];
        let completed = 0;
        games.forEach((game) => {
            db.all(`SELECT category_name FROM game_categories WHERE game_name = ? ORDER BY category_name`, [game.game_name], (err, categories) => {
                if (!err && categories) result.push({ name: game.game_name, categories: categories.map(c => ({ name: c.category_name })) });
                completed++;
                if (completed === games.length) res.json(result);
            });
        });
    });
});

app.get('/api/items', (req, res) => {
    const { game, category, sort = 'new', page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = `SELECT i.*, u.name as seller_name, u.avatar as seller_avatar, u.reviews_count as seller_reviews, u.role as seller_role
                 FROM items i JOIN users u ON i.seller_id = u.id WHERE i.status = 'active'`;
    let params = [];
    if (game) { query += ` AND i.game_name = ?`; params.push(decodeURIComponent(game)); }
    if (category) { query += ` AND i.category_name = ?`; params.push(decodeURIComponent(category)); }
    switch(sort) {
        case 'price_asc': query += ` ORDER BY i.price ASC`; break;
        case 'price_desc': query += ` ORDER BY i.price DESC`; break;
        case 'popular': query += ` ORDER BY i.views DESC`; break;
        default: query += ` ORDER BY i.created_at DESC`;
    }
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    db.all(query, params, (err, items) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.json({ items: items || [], total: items?.length || 0, page: parseInt(page), limit: parseInt(limit) });
    });
});

app.get('/api/items/:id', (req, res) => {
    db.get(`SELECT i.*, u.name as seller_name, u.avatar as seller_avatar, u.reviews_count as seller_reviews, u.role as seller_role
            FROM items i JOIN users u ON i.seller_id = u.id WHERE i.id = ? AND i.status = 'active'`, [req.params.id], (err, item) => {
        if (err || !item) return res.status(404).json({ error: 'Товар не найден' });
        db.run(`UPDATE items SET views = views + 1 WHERE id = ?`, [req.params.id]);
        res.json(item);
    });
});

app.post('/api/items/create', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { game_name, category_name, title, description, price } = req.body;
    if (!game_name || !category_name || !title || !price) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    if (price <= 0) return res.status(400).json({ error: 'Цена должна быть больше 0' });
    db.run(`INSERT INTO items (seller_id, game_name, category_name, title, description, price, status) VALUES (?, ?, ?, ?, ?, ?, 'active')`,
        [req.session.userId, game_name, category_name, title, description || '', price], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания товара' });
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'sales_count');
            }, 500);
            res.json({ success: true, id: this.lastID, message: 'Товар успешно создан' });
        });
});

app.post('/api/items', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { title, description, price, category } = req.body;
    if (!title || !price) return res.status(400).json({ error: 'Название и цена обязательны' });
    db.run(`INSERT INTO user_items (user_id, title, description, price, category) VALUES (?, ?, ?, ?, ?)`,
        [req.session.userId, title, description || '', price, category || 'other'], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания товара' });
            res.json({ success: true, id: this.lastID });
        });
});

app.delete('/api/items/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.run(`DELETE FROM user_items WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        res.json({ success: true });
    });
});

app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ items: [] });
    const searchTerm = `%${q}%`;
    db.all(`SELECT i.*, u.name as seller_name, u.avatar as seller_avatar FROM items i JOIN users u ON i.seller_id = u.id WHERE i.status = 'active' AND (i.title LIKE ? OR i.description LIKE ?) LIMIT 30`, [searchTerm, searchTerm], (err, items) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        res.json({ items: items || [] });
    });
});

// ============ API ТИКЕТОВ ============
app.get('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC`, [req.session.userId], (err, tickets) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(tickets || []);
    });
});

app.post('/api/tickets', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { subject, message, department, subcategory, priority, order_number } = req.body;
    if (!subject || !message || !department) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    db.get(`SELECT id FROM tickets WHERE user_id = ? AND status != 'closed'`, [req.session.userId], (err, activeTicket) => {
        if (activeTicket) return res.status(400).json({ error: 'У вас уже есть активное обращение' });
        const ticketNumber = generateTicketNumber();
        db.run(`INSERT INTO tickets (ticket_number, user_id, subject, message, department, subcategory, priority, order_number, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
            [ticketNumber, req.session.userId, subject, message, department, subcategory || null, priority || 'medium', order_number || null], function(err) {
                if (err) return res.status(500).json({ error: 'Ошибка создания обращения' });
                res.json({ success: true, ticket_id: this.lastID, ticket_number: ticketNumber });
            });
    });
});

app.get('/api/tickets/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT * FROM tickets WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: 'Тикет не найден' });
        db.all(`SELECT r.*, u.name as user_name, u.avatar as user_avatar, u.role FROM ticket_replies r JOIN users u ON r.user_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC`, [req.params.id], (err, replies) => {
            res.json({ ticket, replies: replies || [] });
        });
    });
});

app.post('/api/tickets/:id/reply', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Введите сообщение' });
    db.get(`SELECT id, status FROM tickets WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: 'Тикет не найден' });
        if (ticket.status === 'closed') return res.status(400).json({ error: 'Тикет закрыт' });
        db.run(`INSERT INTO ticket_replies (ticket_id, user_id, message, is_staff) VALUES (?, ?, ?, 0)`, [req.params.id, req.session.userId, message], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка отправки' });
            db.run(`UPDATE tickets SET status = 'waiting_support', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
            updateUserStats(req.session.userId, 'messages_count', 1);
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'tickets_closed');
            }, 500);
            res.json({ success: true });
        });
    });
});

app.delete('/api/tickets/:id/delete', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT id FROM tickets WHERE id = ? AND user_id = ?`, [req.params.id, req.session.userId], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: 'Тикет не найден' });
        db.run(`DELETE FROM ticket_replies WHERE ticket_id = ?`, [req.params.id]);
        db.run(`DELETE FROM tickets WHERE id = ?`, [req.params.id]);
        res.json({ success: true });
    });
});

// ============ API КАРЬЕРЫ ============
app.post('/api/careers/apply', (req, res) => {
    const { job_id, job_title, name, email, phone, resume, cover, user_id } = req.body;
    if (!job_id || !job_title || !name || !email) return res.status(400).json({ error: 'Заполните обязательные поля' });
    db.run(`INSERT INTO career_applications (job_id, job_title, name, email, phone, resume, cover, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [job_id, job_title, name, email, phone || null, resume || null, cover || null, user_id || null], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка сохранения отклика' });
            res.json({ success: true, message: 'Отклик отправлен' });
        });
});

// ============ API ЧАТА ============
app.get('/api/chats', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const userId = req.session.userId;
    db.all(`SELECT c.*, CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id, u.name as other_user_name, u.avatar as other_user_avatar
            FROM chats c JOIN users u ON u.id = (CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END)
            WHERE (c.user1_id = ? OR c.user2_id = ?) ORDER BY c.last_message_time DESC`,
        [userId, userId, userId, userId], (err, chats) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки чатов' });
            res.json(chats || []);
        });
});

app.get('/api/chats/:id/messages', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const chatId = req.params.id;
    const userId = req.session.userId;
    db.get(`SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)`, [chatId, userId, userId], (err, chat) => {
        if (err || !chat) return res.status(404).json({ error: 'Чат не найден' });
        db.all(`SELECT m.*, u.name as sender_name, u.avatar as sender_avatar FROM chat_messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = ? ORDER BY m.created_at ASC`, [chatId], (err, messages) => {
            db.run(`UPDATE chat_messages SET is_read = 1 WHERE chat_id = ? AND sender_id != ? AND is_read = 0`, [chatId, userId]);
            const updateField = chat.user1_id === userId ? 'user1_unread' : 'user2_unread';
            db.run(`UPDATE chats SET ${updateField} = 0 WHERE id = ?`, [chatId]);
            res.json({ messages: messages || [], chat });
        });
    });
});

app.post('/api/chats/:id/messages', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const chatId = req.params.id;
    const userId = req.session.userId;
    const { message } = req.body;
    if (!message || message.trim() === '') return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    
    // Получаем информацию о чате
    db.get(`SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)`, [chatId, userId, userId], (err, chat) => {
        if (err || !chat) return res.status(404).json({ error: 'Чат не найден' });
        
        // Определяем ID собеседника
        const otherUserId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
        
        // Проверяем, не является ли собеседник системным аккаунтом
        db.get(`SELECT user_id FROM users WHERE id = ? AND user_id = '00000000'`, [otherUserId], (err, systemUser) => {
            if (systemUser) {
                return res.status(403).json({ 
                    error: 'Нельзя отправлять сообщения системному аккаунту NullMarket. Это служебный аккаунт для уведомлений.' 
                });
            }
            
            // Если всё ок - отправляем сообщение
            db.run(`INSERT INTO chat_messages (chat_id, sender_id, message) VALUES (?, ?, ?)`, [chatId, userId, message.trim()], function(err) {
                if (err) return res.status(500).json({ error: 'Ошибка отправки сообщения' });
                const otherUnreadField = chat.user1_id === userId ? 'user2_unread' : 'user1_unread';
                db.run(`UPDATE chats SET last_message = ?, last_message_time = CURRENT_TIMESTAMP, ${otherUnreadField} = ${otherUnreadField} + 1 WHERE id = ?`, [message.trim(), chatId]);
                updateUserStats(userId, 'messages_count', 1);
                res.json({ success: true });
            });
        });
    });
});

app.post('/api/chats', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { otherUserId, itemId, initialMessage } = req.body;
    if (!otherUserId || otherUserId == req.session.userId) return res.status(400).json({ error: 'Некорректный получатель' });
    db.get(`SELECT id FROM users WHERE id = ? AND status = 'active'`, [otherUserId], (err, otherUser) => {
        if (err || !otherUser) return res.status(404).json({ error: 'Пользователь не найден' });
        db.get(`SELECT id FROM chats WHERE ((user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)) AND (item_id = ? OR (item_id IS NULL AND ? IS NULL))`,
            [req.session.userId, otherUserId, otherUserId, req.session.userId, itemId || null, itemId || null], (err, existingChat) => {
                if (existingChat) return res.json({ success: true, chat_id: existingChat.id, isNew: false });
                db.run(`INSERT INTO chats (user1_id, user2_id, item_id, last_message) VALUES (?, ?, ?, ?)`,
                    [req.session.userId, otherUserId, itemId || null, initialMessage || ''], function(err) {
                        if (err) return res.status(500).json({ error: 'Ошибка создания чата' });
                        const chatId = this.lastID;
                        if (initialMessage && initialMessage.trim()) {
                            db.run(`INSERT INTO chat_messages (chat_id, sender_id, message) VALUES (?, ?, ?)`, [chatId, req.session.userId, initialMessage.trim()]);
                            db.run(`UPDATE chats SET user2_unread = 1 WHERE id = ?`, [chatId]);
                        }
                        res.json({ success: true, chat_id: chatId, isNew: true });
                    });
            });
    });
});

app.delete('/api/chats/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const chatId = req.params.id;
    const userId = req.session.userId;
    db.get(`SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)`, [chatId, userId, userId], (err, chat) => {
        if (err || !chat) return res.status(404).json({ error: 'Чат не найден' });
        const deleteField = chat.user1_id === userId ? 'user1_deleted' : 'user2_deleted';
        db.run(`UPDATE chats SET ${deleteField} = 1 WHERE id = ?`, [chatId]);
        db.get(`SELECT user1_deleted, user2_deleted FROM chats WHERE id = ?`, [chatId], (err, chat) => {
            if (chat && chat.user1_deleted === 1 && chat.user2_deleted === 1) {
                db.run(`DELETE FROM chat_messages WHERE chat_id = ?`, [chatId]);
                db.run(`DELETE FROM chats WHERE id = ?`, [chatId]);
            }
        });
        res.json({ success: true });
    });
});

app.get('/api/chats/unread/count', (req, res) => {
    if (!req.session.userId) return res.json({ count: 0 });
    const userId = req.session.userId;
    db.get(`SELECT COALESCE(SUM(CASE WHEN user1_id = ? THEN user1_unread WHEN user2_id = ? THEN user2_unread ELSE 0 END), 0) as total_unread FROM chats WHERE (user1_id = ? OR user2_id = ?)`, [userId, userId, userId, userId], (err, result) => {
        res.json({ count: result?.total_unread || 0 });
    });
});

// ============ API ДОСТИЖЕНИЙ ============
app.get('/api/achievements/collections', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT * FROM achievement_collections ORDER BY sort_order`, (err, collections) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        db.all(`SELECT a.*, ua.unlocked_at, ua.is_completed, ua.is_featured 
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                ORDER BY a.collection_id, a.requirement_value ASC`, [req.session.userId], (err, achievements) => {
            if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
            const result = collections.map(col => ({
                ...col,
                achievements: achievements.filter(a => a.collection_id === col.id).map(a => ({
                    ...a,
                    unlocked: !!a.unlocked_at,
                    unlocked_at: a.unlocked_at,
                    is_featured: a.is_featured || 0
                }))
            }));
            res.json(result);
        });
    });
});

app.post('/api/achievements/feature', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { achievement_id } = req.body;
    db.run(`UPDATE user_achievements SET is_featured = 0 WHERE user_id = ?`, [req.session.userId], (err) => {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        db.run(`UPDATE user_achievements SET is_featured = 1 WHERE user_id = ? AND achievement_id = ? AND is_completed = 1`, 
            [req.session.userId, achievement_id], (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка' });
            res.json({ success: true });
        });
    });
});

app.get('/api/user/featured-achievement/:userId', (req, res) => {
    db.get(`SELECT a.*, ua.unlocked_at FROM achievements a 
            JOIN user_achievements ua ON a.id = ua.achievement_id 
            WHERE ua.user_id = ? AND ua.is_featured = 1`, [req.params.userId], (err, achievement) => {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        res.json(achievement || null);
    });
});

app.get('/api/achievements', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT * FROM achievements ORDER BY collection_id, requirement_value ASC`, (err, achievements) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        db.all(`SELECT achievement_id, unlocked_at, progress, is_completed FROM user_achievements WHERE user_id = ?`, [req.session.userId], (err, userAch) => {
            const userMap = {};
            (userAch || []).forEach(ua => { userMap[ua.achievement_id] = ua; });
            const result = achievements.map(ach => ({
                ...ach,
                unlocked: !!userMap[ach.id],
                unlocked_at: userMap[ach.id]?.unlocked_at,
                progress: userMap[ach.id]?.progress || 0,
                is_completed: userMap[ach.id]?.is_completed || 0
            }));
            res.json(result);
        });
    });
});

app.get('/api/achievements/stats', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT 
        julianday('now') - julianday(created_at) as days_on_platform,
        (SELECT COUNT(*) FROM bug_reports WHERE user_id = ?) as reports_created,
        (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND status = 'fixed') as reports_fixed,
        (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'critical') as critical_reports,
        (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'high') as high_reports,
        (SELECT COUNT(*) FROM bug_reports WHERE user_id = ? AND priority = 'medium') as medium_reports,
        (SELECT COUNT(*) FROM test_cases WHERE author_id = ?) as testcases_created,
        (SELECT COUNT(*) FROM checklists WHERE author_id = ?) as checklists_created,
        (SELECT COUNT(*) FROM checklists WHERE author_id = ? AND status = 'completed') as checklists_completed,
        (SELECT COUNT(*) FROM report_comments WHERE user_id = ?) as comments_count,
        (SELECT COUNT(*) FROM orders WHERE user_id = ?) as purchases_count,
        (SELECT COUNT(*) FROM user_items WHERE user_id = ?) as sales_count,
        (SELECT COUNT(*) FROM user_achievements WHERE user_id = ? AND is_completed = 1) as achievements_count,
        (SELECT balance FROM users WHERE id = ?) as balance
    `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId, req.session.userId], (err, stats) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(stats || {
            days_on_platform: 0, reports_created: 0, reports_fixed: 0, critical_reports: 0,
            high_reports: 0, medium_reports: 0, testcases_created: 0, checklists_created: 0,
            checklists_completed: 0, comments_count: 0, purchases_count: 0, sales_count: 0,
            achievements_count: 0, balance: 0
        });
    });
});

app.post('/api/achievements/check', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    checkAndUnlockAchievements(req.session.userId).then(newUnlocked => {
        res.json({ unlocked: newUnlocked });
    }).catch(err => {
        res.status(500).json({ error: 'Ошибка проверки достижений' });
    });
});



app.post('/api/promotion/apply', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    const { desired_role, reason } = req.body;
    
    // ПРОВЕРКА: логируем что пришло
    console.log('POST /api/promotion/apply');
    console.log('User ID:', req.session.userId);
    console.log('Request body:', req.body);
    console.log('desired_role:', desired_role);
    console.log('reason:', reason);
    
    if (!desired_role) {
        console.log('Ошибка: desired_role не указан');
        return res.status(400).json({ error: 'Укажите желаемую роль' });
    }
    
    // Проверяем текущую роль пользователя
    db.get('SELECT role, name FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) {
            console.log('Ошибка: пользователь не найден', err);
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        console.log('Текущий пользователь:', user.name, 'Роль:', user.role);
        
        // Проверяем, можно ли повыситься до этой роли
        const nextRole = getNextRole(user.role);
        console.log('Следующая роль:', nextRole);
        console.log('Запрошенная роль:', desired_role);
        
        if (nextRole !== desired_role) {
            return res.status(400).json({ 
                error: `Вы не можете подать заявку на роль ${desired_role}. Доступна роль: ${nextRole || 'нет доступных повышений'}` 
            });
        }
        
        // Проверяем, нет ли уже активной заявки
        db.get(`SELECT id FROM promotion_requests WHERE user_id = ? AND status = 'pending'`, [req.session.userId], (err, existing) => {
            if (existing) {
                return res.status(400).json({ error: 'У вас уже есть активная заявка на повышение' });
            }
            
            const oldRole = user.role;
            
            // ОБНОВЛЯЕМ РОЛЬ
            db.run(
                `UPDATE users SET role = ? WHERE id = ?`,
                [desired_role, req.session.userId],
                function(err) {
                    if (err) {
                        console.error('Ошибка обновления роли:', err);
                        return res.status(500).json({ error: 'Ошибка обновления роли' });
                    }
                    
                    console.log(`Роль обновлена: ${oldRole} -> ${desired_role}`);
                    
                    // Обновляем сессию
                    req.session.userRole = desired_role;
                    
                    // Сохраняем историю
                    db.run(
                        `INSERT INTO promotion_requests (user_id, current_role, desired_role, reason, status, reviewed_by, reviewed_at) 
                         VALUES (?, ?, ?, ?, 'approved', ?, CURRENT_TIMESTAMP)`,
                        [req.session.userId, oldRole, desired_role, reason || 'Автоматическое повышение', req.session.userId],
                        function(err) {
                            if (err) console.error('Ошибка сохранения истории:', err);
                        }
                    );
                    
                    logAdminAction(req.session.userId, 'promotion', `Пользователь ${user.name} повышен: ${oldRole} -> ${desired_role}`);
                    
                    res.json({ 
                        success: true, 
                        message: 'Роль успешно повышена',
                        old_role: oldRole,
                        new_role: desired_role
                    });
                }
            );
        });
    });
});
// Эндпоинт для проверки возможности повышения
app.get('/api/promotion/status', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const nextRole = getNextRole(user.role);
        const currentLevel = getRoleLevel(user.role);
        const nextLevel = nextRole ? getRoleLevel(nextRole) : null;
        
        db.get(`SELECT id, status, created_at FROM promotion_requests WHERE user_id = ? AND status = 'pending'`, [req.session.userId], (err, pending) => {
            res.json({
                current_role: user.role,
                current_level: currentLevel,
                next_role: nextRole,
                next_level: nextLevel,
                can_promote: !!nextRole,
                has_pending_request: !!pending,
                pending_request_id: pending?.id || null,
                pending_since: pending?.created_at || null
            });
        });
    });
});

app.get('/api/promotion/available', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Не авторизован' });
    }
    
    db.get('SELECT role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const nextRole = getNextRole(user.role);
        const allRoles = [
            { value: 'support_trainee', name: 'Стажер Поддержки', level: 1 },
            { value: 'tech_support', name: 'Тех. Поддержка', level: 2 },
            { value: 'pro_support', name: 'Проф. Поддержка', level: 3 },
            { value: 'recruiter', name: 'Рекрутер', level: 4 },
            { value: 'curator', name: 'Куратор', level: 5 },
            { value: 'community_manager', name: 'Community Manager', level: 6 },
            { value: 'junior_admin', name: 'Мл. Администратор', level: 7 },
            { value: 'admin', name: 'Администратор', level: 8 },
            { value: 'tech_admin', name: 'Тех. Администратор', level: 9 },
            { value: 'developer', name: 'Разработчик', level: 10 },
            { value: 'project_leadership', name: 'Project Leadership', level: 11 },
            { value: 'co_owner', name: 'Co-Owner', level: 12 },
            { value: 'owner', name: 'Owner', level: 13 }
        ];
        
        const currentLevel = getRoleLevel(user.role);
        const available = allRoles.filter(r => r.level > currentLevel);
        
        // Если есть следующая роль, показываем только её (строгая последовательность)
        // Или показываем все доступные, если хотите дать выбор
        const nextRoleObj = allRoles.find(r => r.value === nextRole);
        
        res.json({
            current_role: user.role,
            current_level: currentLevel,
            available_roles: nextRoleObj ? [nextRoleObj] : [],
            all_roles: allRoles.filter(r => r.level > currentLevel)
        });
    });
});

// ============ API ЖАЛОБ ============
app.post('/api/report-message', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { message_id, reason, comment } = req.body;
    if (!message_id || !reason) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    db.get(`SELECT sender_id, chat_id, message FROM chat_messages WHERE id = ?`, [message_id], (err, message) => {
        if (err || !message) return res.status(404).json({ error: 'Сообщение не найдено' });
        if (message.sender_id === req.session.userId) return res.status(400).json({ error: 'Нельзя жаловаться на свои сообщения' });
        db.get(`SELECT id FROM message_reports WHERE message_id = ? AND reporter_id = ?`, [message_id, req.session.userId], (err, existing) => {
            if (existing) return res.status(400).json({ error: 'Вы уже отправили жалобу на это сообщение' });
            db.run(`INSERT INTO message_reports (message_id, reporter_id, reported_user_id, reason, comment) VALUES (?, ?, ?, ?, ?)`,
                [message_id, req.session.userId, message.sender_id, reason, comment || null], function(err) {
                    if (err) return res.status(500).json({ error: 'Ошибка отправки жалобы' });
                    db.run(`UPDATE users SET reports_count = COALESCE(reports_count, 0) + 1 WHERE id = ?`, [message.sender_id]);
                    res.json({ success: true, message: 'Жалоба отправлена' });
                });
        });
    });
});

// ============ API БЛОКИРОВКИ ============
app.post('/api/block-user', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const { blocked_user_id } = req.body;
    if (!blocked_user_id) return res.status(400).json({ error: 'Укажите пользователя' });
    if (blocked_user_id === req.session.userId) return res.status(400).json({ error: 'Нельзя заблокировать самого себя' });
    db.run(`INSERT OR IGNORE INTO blocked_users (user_id, blocked_user_id) VALUES (?, ?)`, [req.session.userId, blocked_user_id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка блокировки' });
        res.json({ success: true, message: 'Пользователь заблокирован' });
    });
});

app.delete('/api/block-user/:blockedUserId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.run(`DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?`, [req.session.userId, req.params.blockedUserId], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка разблокировки' });
        res.json({ success: true });
    });
});

app.get('/api/blocked-users', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.all(`SELECT bu.blocked_user_id, u.name, u.avatar, u.user_id, u.role FROM blocked_users bu JOIN users u ON bu.blocked_user_id = u.id WHERE bu.user_id = ?`, [req.session.userId], (err, blocked) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(blocked || []);
    });
});

// ============ АДМИН API ============
app.get('/api/admin/stats', isAdmin, (req, res) => {
    db.get(`SELECT COUNT(*) as totalUsers FROM users`, (err, users) => {
        db.get(`SELECT COUNT(*) as totalItems FROM items WHERE status = 'active'`, (err, items) => {
            db.get(`SELECT COUNT(*) as totalOrders FROM orders`, (err, orders) => {
                db.get(`SELECT COUNT(*) as totalTickets FROM tickets`, (err, tickets) => {
                    db.get(`SELECT COUNT(*) as pendingTickets FROM tickets WHERE status != 'closed'`, (err, pending) => {
                        db.get(`SELECT COALESCE(SUM(amount), 0) as totalRevenue FROM orders WHERE status = 'completed'`, (err, revenue) => {
                            db.get(`SELECT COALESCE(SUM(amount), 0) as totalWithdrawals FROM withdrawals WHERE status = 'pending'`, (err, withdrawals) => {
                                db.get(`SELECT COUNT(*) as pendingReports FROM message_reports WHERE status = 'pending'`, (err, reports) => {
                                    db.get(`SELECT COUNT(*) as pendingCollaborations FROM collaborations WHERE status = 'pending'`, (err, collaborations) => {
                                        db.get(`SELECT COUNT(*) as totalBugReports FROM bug_reports`, (err, bugReports) => {
                                            res.json({
                                                totalUsers: users?.totalUsers || 0,
                                                totalItems: items?.totalItems || 0,
                                                totalOrders: orders?.totalOrders || 0,
                                                totalTickets: tickets?.totalTickets || 0,
                                                pendingTickets: pending?.pendingTickets || 0,
                                                totalRevenue: revenue?.totalRevenue || 0,
                                                totalWithdrawals: withdrawals?.totalWithdrawals || 0,
                                                pendingReports: reports?.pendingReports || 0,
                                                pendingCollaborations: collaborations?.pendingCollaborations || 0,
                                                totalBugReports: bugReports?.totalBugReports || 0
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

app.get('/api/admin/tickets/recent', isAdmin, (req, res) => {
    db.all(`SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 10`, (err, tickets) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(tickets || []);
    });
});

app.get('/api/admin/recent-activity', isAdmin, (req, res) => {
    db.all(`SELECT 'Новый пользователь' as action, name as user_name, created_at FROM users ORDER BY created_at DESC LIMIT 10`, (err, activities) => {
        res.json(activities || []);
    });
});

app.get('/api/admin/users', isAdmin, (req, res) => {
    db.all(`SELECT id, user_id, name, email, phone, avatar, balance, reviews_count, role, verified, status, reports_count, warnings, created_at, tickets_closed, messages_count FROM users ORDER BY created_at DESC`, (err, users) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(users || []);
    });
});

app.put('/api/admin/users/:id', isAdmin, (req, res) => {
    const { role, balance } = req.body;
    db.run(`UPDATE users SET role = ?, balance = ? WHERE id = ?`, [role, balance, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        logAdminAction(req.session.userId, 'update_user', `Обновлён пользователь ${req.params.id}`);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/balance', isAdmin, (req, res) => {
    const { amount, reason } = req.body;
    if (isNaN(amount)) return res.status(400).json({ error: 'Неверная сумма' });
    db.get(`SELECT balance FROM users WHERE id = ?`, [req.params.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        const newBalance = user.balance + amount;
        db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления баланса' });
            db.run(`INSERT INTO balance_history (user_id, amount, reason) VALUES (?, ?, ?)`, [req.params.id, amount, reason || 'Изменение администратором']);
            logAdminAction(req.session.userId, 'change_balance', `Пользователь ${req.params.id}, сумма: ${amount}`);
            setTimeout(() => {
                checkAndUnlockAchievements(req.params.id, 'balance_amount');
            }, 500);
            res.json({ success: true, newBalance });
        });
    });
});

app.post('/api/admin/users/:id/stats', isAdmin, (req, res) => {
    const stats = req.body;
    const allowedStats = ['tickets_closed', 'messages_count', 'items_moderated', 'reports_processed', 'admin_actions', 'successful_deals', 'hours_online', 'recruits_count', 'warnings_issued', 'bans_issued', 'tickets_resolved_urgent', 'trainings_completed', 'events_held', 'conflicts_resolved', 'features_created', 'bugs_fixed'];
    const updates = [];
    const params = [];
    allowedStats.forEach(stat => {
        if (stats[stat] !== undefined) {
            updates.push(`${stat} = ?`);
            params.push(stats[stat]);
        }
    });
    if (updates.length === 0) return res.status(400).json({ error: 'Нет данных для обновления' });
    params.push(req.params.id);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления статистики' });
        logAdminAction(req.session.userId, 'update_stats', `Обновлена статистика пользователя ${req.params.id}`);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/block', isAdmin, (req, res) => {
    db.run(`UPDATE users SET status = 'blocked' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка блокировки' });
        logAdminAction(req.session.userId, 'block_user', `Пользователь ${req.params.id} заблокирован`);
        updateUserStats(req.session.userId, 'bans_issued', 1);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/unblock', isAdmin, (req, res) => {
    db.run(`UPDATE users SET status = 'active' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка разблокировки' });
        logAdminAction(req.session.userId, 'unblock_user', `Пользователь ${req.params.id} разблокирован`);
        res.json({ success: true });
    });
});

app.post('/api/admin/users/:id/warn', isAdmin, (req, res) => {
    db.run(`UPDATE users SET warnings = COALESCE(warnings, 0) + 1 WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка выдачи предупреждения' });
        logAdminAction(req.session.userId, 'warn_user', `Пользователь ${req.params.id} получил предупреждение`);
        updateUserStats(req.session.userId, 'warnings_issued', 1);
        res.json({ success: true });
    });
});

app.get('/api/admin/items', isAdmin, (req, res) => {
    db.all(`SELECT i.*, u.name as seller_name FROM items i LEFT JOIN users u ON i.seller_id = u.id ORDER BY i.created_at DESC`, (err, items) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(items || []);
    });
});

app.post('/api/admin/items/:id/hide', isAdmin, (req, res) => {
    db.run(`UPDATE items SET status = 'hidden' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        logAdminAction(req.session.userId, 'hide_item', `Товар ${req.params.id} скрыт`);
        updateUserStats(req.session.userId, 'items_moderated', 1);
        res.json({ success: true });
    });
});

app.post('/api/admin/items/:id/activate', isAdmin, (req, res) => {
    db.run(`UPDATE items SET status = 'active' WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка' });
        logAdminAction(req.session.userId, 'activate_item', `Товар ${req.params.id} активирован`);
        res.json({ success: true });
    });
});

app.delete('/api/admin/items/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM items WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        logAdminAction(req.session.userId, 'delete_item', `Товар ${req.params.id} удалён`);
        res.json({ success: true });
    });
});

app.put('/api/admin/items/:id', isAdmin, (req, res) => {
    const { title, price, description } = req.body;
    db.run(`UPDATE items SET title = ?, price = ?, description = ? WHERE id = ?`, [title, price, description, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        res.json({ success: true });
    });
});

app.get('/api/admin/tickets', isAdmin, (req, res) => {
    db.all(`SELECT t.*, u.name as user_name FROM tickets t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC`, (err, tickets) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(tickets || []);
    });
});

app.get('/api/admin/tickets/:id/detail', isAdmin, (req, res) => {
    db.get(`SELECT t.*, u.name as user_name, u.role as user_role FROM tickets t LEFT JOIN users u ON t.user_id = u.id WHERE t.id = ?`, [req.params.id], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: 'Тикет не найден' });
        db.all(`SELECT r.*, u.name as user_name, u.role FROM ticket_replies r JOIN users u ON r.user_id = u.id WHERE r.ticket_id = ? ORDER BY r.created_at ASC`, [req.params.id], (err, replies) => {
            res.json({ ticket, replies: replies || [] });
        });
    });
});

app.post('/api/admin/tickets/:id/reply', isAdmin, (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Введите сообщение' });
    db.get(`SELECT id, status FROM tickets WHERE id = ?`, [req.params.id], (err, ticket) => {
        if (err || !ticket) return res.status(404).json({ error: 'Тикет не найден' });
        db.run(`INSERT INTO ticket_replies (ticket_id, user_id, message, is_staff) VALUES (?, ?, ?, 1)`, [req.params.id, req.session.userId, message], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка отправки' });
            db.run(`UPDATE tickets SET status = 'waiting_user', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
            logAdminAction(req.session.userId, 'reply_ticket', `Ответ на тикет #${ticket.id}`);
            updateUserStats(req.session.userId, 'messages_count', 1);
            res.json({ success: true });
        });
    });
});

app.put('/api/admin/tickets/:id/status', isAdmin, (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        if (status === 'closed') {
            db.run(`UPDATE tickets SET resolved_by = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.session.userId, req.params.id]);
            updateUserStats(req.session.userId, 'tickets_closed', 1);
        }
        logAdminAction(req.session.userId, 'change_ticket_status', `Тикет #${req.params.id} -> ${status}`);
        res.json({ success: true });
    });
});

app.get('/api/admin/orders', isAdmin, (req, res) => {
    db.all(`SELECT o.*, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`, (err, orders) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(orders || []);
    });
});

app.put('/api/admin/orders/:id/status', isAdmin, (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE orders SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления' });
        if (status === 'completed') {
            updateUserStats(req.session.userId, 'successful_deals', 1);
            setTimeout(() => {
                checkAndUnlockAchievements(req.session.userId, 'purchases_count');
            }, 500);
        }
        res.json({ success: true });
    });
});

app.get('/api/admin/reviews', isAdmin, (req, res) => {
    db.all(`SELECT r.*, u1.name as from_user_name, u2.name as to_user_name FROM reviews r LEFT JOIN users u1 ON r.from_user_id = u1.id LEFT JOIN users u2 ON r.to_user_id = u2.id ORDER BY r.created_at DESC`, (err, reviews) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(reviews || []);
    });
});

app.delete('/api/admin/reviews/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM reviews WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        res.json({ success: true });
    });
});

app.get('/api/admin/categories', isAdmin, (req, res) => {
    db.all(`SELECT * FROM game_categories ORDER BY game_name, category_name`, (err, categories) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(categories || []);
    });
});

app.post('/api/admin/categories', isAdmin, (req, res) => {
    const { game_name, category_name } = req.body;
    if (!game_name || !category_name) return res.status(400).json({ error: 'Заполните все поля' });
    db.run(`INSERT OR IGNORE INTO game_categories (game_name, category_name) VALUES (?, ?)`, [game_name, category_name], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка добавления' });
        logAdminAction(req.session.userId, 'add_category', `${game_name} - ${category_name}`);
        res.json({ success: true });
    });
});

app.delete('/api/admin/categories/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM game_categories WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        res.json({ success: true });
    });
});

app.get('/api/admin/withdrawals', isAdmin, (req, res) => {
    db.all(`SELECT w.*, u.name as user_name FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC`, (err, withdrawals) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(withdrawals || []);
    });
});

app.post('/api/admin/withdrawals/:id/process', isAdmin, (req, res) => {
    const { status } = req.body;
    db.get(`SELECT user_id, amount FROM withdrawals WHERE id = ? AND status = 'pending'`, [req.params.id], (err, withdrawal) => {
        if (err || !withdrawal) return res.status(404).json({ error: 'Заявка не найдена' });
        db.run(`UPDATE withdrawals SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обработки' });
            if (status === 'rejected') db.run(`UPDATE users SET balance = balance + ? WHERE id = ?`, [withdrawal.amount, withdrawal.user_id]);
            logAdminAction(req.session.userId, 'process_withdrawal', `Заявка ${req.params.id} -> ${status}`);
            res.json({ success: true });
        });
    });
});

app.get('/api/admin/promocodes', isAdmin, (req, res) => {
    db.all(`SELECT * FROM promocodes ORDER BY created_at DESC`, (err, promocodes) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(promocodes || []);
    });
});

app.post('/api/admin/promocodes', isAdmin, (req, res) => {
    const { code, discount_type, discount_value, max_uses } = req.body;
    if (!code || !discount_value) return res.status(400).json({ error: 'Заполните все поля' });
    db.run(`INSERT INTO promocodes (code, discount_type, discount_value, max_uses) VALUES (?, ?, ?, ?)`, [code.toUpperCase(), discount_type, discount_value, max_uses || null], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Промокод с таким кодом уже существует' });
            return res.status(500).json({ error: 'Ошибка создания' });
        }
        logAdminAction(req.session.userId, 'create_promocode', `Промокод ${code}`);
        res.json({ success: true });
    });
});

app.post('/api/admin/promocodes/:id/toggle', isAdmin, (req, res) => {
    db.get(`SELECT is_active FROM promocodes WHERE id = ?`, [req.params.id], (err, promo) => {
        if (err || !promo) return res.status(404).json({ error: 'Промокод не найден' });
        const newStatus = promo.is_active ? 0 : 1;
        db.run(`UPDATE promocodes SET is_active = ? WHERE id = ?`, [newStatus, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обновления' });
            res.json({ success: true });
        });
    });
});

app.delete('/api/admin/promocodes/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM promocodes WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        res.json({ success: true });
    });
});

app.get('/api/admin/promotions', isAdmin, (req, res) => {
    db.all(`SELECT pr.*, u.name as user_name FROM promotion_requests pr LEFT JOIN users u ON pr.user_id = u.id ORDER BY pr.created_at DESC`, (err, promotions) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(promotions || []);
    });
});

app.post('/api/admin/promotions', isAdmin, (req, res) => {
    const { user_id, desired_role, reason } = req.body;
    db.get(`SELECT id, role, name FROM users WHERE id = ?`, [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        db.run(`INSERT INTO promotion_requests (user_id, current_role, desired_role, reason, status) VALUES (?, ?, ?, ?, 'pending')`, [user_id, user.role, desired_role, reason || null], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания заявки' });
            logAdminAction(req.session.userId, 'create_promotion', `Заявка на повышение для пользователя ${user.name} -> ${desired_role}`);
            res.json({ success: true });
        });
    });
});

app.put('/api/admin/promotions/:id/process', isAdmin, (req, res) => {
    const { status } = req.body;
    db.get(`SELECT user_id, desired_role, current_role FROM promotion_requests WHERE id = ?`, [req.params.id], (err, promotion) => {
        if (err || !promotion) return res.status(404).json({ error: 'Заявка не найдена' });
        db.run(`UPDATE promotion_requests SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.session.userId, req.params.id], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка обработки' });
            if (status === 'approved') db.run(`UPDATE users SET role = ? WHERE id = ?`, [promotion.desired_role, promotion.user_id]);
            logAdminAction(req.session.userId, 'process_promotion', `Заявка #${req.params.id} -> ${status}`);
            res.json({ success: true });
        });
    });
});

app.get('/api/admin/logs', isAdmin, (req, res) => {
    db.all(`SELECT l.*, u.name as admin_name FROM admin_logs l LEFT JOIN users u ON l.admin_id = u.id ORDER BY l.created_at DESC LIMIT 100`, (err, logs) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        res.json(logs || []);
    });
});

app.get('/api/admin/settings', isAdmin, (req, res) => {
    db.all(`SELECT setting_key, setting_value FROM platform_settings`, (err, settings) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки' });
        const result = {};
        (settings || []).forEach(s => { result[s.setting_key] = s.setting_value; });
        res.json(result);
    });
});

app.put('/api/admin/settings', isAdmin, (req, res) => {
    const { platformFee, minWithdraw, adminEmail, siteName, siteDescription, maxSelfPromoteRole } = req.body;
    if (platformFee !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'platformFee'`, [platformFee.toString()]);
    if (minWithdraw !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'minWithdraw'`, [minWithdraw.toString()]);
    if (adminEmail !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'adminEmail'`, [adminEmail]);
    if (siteName !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'siteName'`, [siteName]);
    if (siteDescription !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'siteDescription'`, [siteDescription]);
    if (maxSelfPromoteRole !== undefined) db.run(`UPDATE platform_settings SET setting_value = ?, updated_at = CURRENT_TIMESTAMP WHERE setting_key = 'maxSelfPromoteRole'`, [maxSelfPromoteRole]);
    logAdminAction(req.session.userId, 'update_settings', 'Обновлены настройки платформы');
    res.json({ success: true });
});

// ============ API СОТРУДНИЧЕСТВА ============
app.get('/api/admin/collaborations', isAdmin, (req, res) => {
    const { status, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM collaborations`;
    let params = [];
    if (status && status !== 'all') { query += ` WHERE status = ?`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    db.all(query, params, (err, collaborations) => {
        if (err) return res.status(500).json({ error: 'Ошибка загрузки заявок' });
        res.json(collaborations || []);
    });
});

app.post('/api/admin/collaborations', isAdmin, (req, res) => {
    const { company_name, contact_name, email, phone, type, message } = req.body;
    if (!company_name || !contact_name || !email || !message) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    db.run(`INSERT INTO collaborations (company_name, contact_name, email, phone, type, message, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [company_name, contact_name, email, phone || null, type || 'other', message], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка создания заявки' });
            logAdminAction(req.session.userId, 'create_collaboration', `Создана заявка от ${company_name}`);
            res.json({ success: true, id: this.lastID });
        });
});

app.put('/api/admin/collaborations/:id/status', isAdmin, (req, res) => {
    const { status } = req.body;
    if (!status || !['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Неверный статус' });
    db.run(`UPDATE collaborations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка обновления статуса' });
        logAdminAction(req.session.userId, 'update_collaboration', `Заявка #${req.params.id} -> ${status}`);
        res.json({ success: true });
    });
});

app.delete('/api/admin/collaborations/:id', isAdmin, (req, res) => {
    db.run(`DELETE FROM collaborations WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Ошибка удаления' });
        logAdminAction(req.session.userId, 'delete_collaboration', `Удалена заявка #${req.params.id}`);
        res.json({ success: true });
    });
});

app.post('/api/collaborations', (req, res) => {
    const { company_name, contact_name, email, phone, type, message } = req.body;
    if (!company_name || !contact_name || !email || !message) return res.status(400).json({ error: 'Заполните все обязательные поля' });
    db.run(`INSERT INTO collaborations (company_name, contact_name, email, phone, type, message, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [company_name, contact_name, email, phone || null, type || 'other', message], function(err) {
            if (err) return res.status(500).json({ error: 'Ошибка отправки заявки' });
            res.json({ success: true, message: 'Заявка успешно отправлена' });
        });
});

// ============ ДОПОЛНИТЕЛЬНЫЕ API ============
app.get('/api/user-info/:userId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    db.get(`SELECT id, user_id, name, avatar, role, status, last_login, reviews_count, verified, warnings FROM users WHERE id = ?`, [req.params.userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Пользователь не найден' });
        db.get(`SELECT id FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?`, [req.session.userId, user.id], (err, blocked) => {
            res.json({ ...user, is_blocked_by_me: !!blocked });
        });
    });
});

app.delete('/api/messages/:id', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const messageId = req.params.id;
    db.get(`SELECT sender_id, chat_id FROM chat_messages WHERE id = ?`, [messageId], (err, message) => {
        if (err || !message) return res.status(404).json({ error: 'Сообщение не найдено' });
        db.get(`SELECT role FROM users WHERE id = ?`, [req.session.userId], (err, user) => {
            const isAdminUser = user && ['admin', 'owner', 'co_owner', 'moderator', 'project_leadership', 'developer', 'tech_admin'].includes(user.role);
            if (message.sender_id !== req.session.userId && !isAdminUser) return res.status(403).json({ error: 'Нет прав для удаления' });
            db.run(`UPDATE chat_messages SET message = '[Сообщение удалено]', is_deleted = 1 WHERE id = ?`, [messageId], (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка удаления' });
                res.json({ success: true });
            });
        });
    });
});

app.get('/api/admin/messages/search', isAdmin, (req, res) => {
    const { q, limit = 50 } = req.query;
    if (!q || q.length < 2) return res.json({ messages: [] });
    const searchTerm = `%${q}%`;
    db.all(`SELECT m.*, u1.name as sender_name, u1.user_id as sender_uid, u2.name as receiver_name FROM chat_messages m JOIN users u1 ON m.sender_id = u1.id JOIN chats c ON m.chat_id = c.id JOIN users u2 ON (c.user1_id = u2.id OR c.user2_id = u2.id) AND u2.id != m.sender_id WHERE m.message LIKE ? AND m.is_deleted != 1 ORDER BY m.created_at DESC LIMIT ?`, [searchTerm, parseInt(limit)], (err, messages) => {
        if (err) return res.status(500).json({ error: 'Ошибка поиска' });
        res.json({ messages: messages || [] });
    });
});

app.get('/api/user-stats/:userId', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
    const userId = req.params.userId || req.session.userId;
    db.get(`SELECT tickets_closed, messages_count, items_moderated, reports_processed, admin_actions, successful_deals, hours_online, recruits_count, warnings_issued, bans_issued, tickets_resolved_urgent, trainings_completed, events_held, conflicts_resolved, features_created, bugs_fixed FROM users WHERE id = ?`, [userId], (err, stats) => {
        if (err || !stats) return res.json({});
        res.json(stats);
    });
});

// ============ СТАТИЧЕСКИЕ РОУТЫ ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));
app.get('/dev', (req, res) => res.sendFile(path.join(__dirname, 'client', 'dev.html')));
app.get('/auth', (req, res) => res.sendFile(path.join(__dirname, 'client', 'auth.html')));
app.get('/careers', (req, res) => res.sendFile(path.join(__dirname, 'client', 'careers.html')));
app.get('/finances', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'finances.html'));
});
app.get('/order/:orderId', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'order.html'));
});
app.get('/support', (req, res) => res.sendFile(path.join(__dirname, 'client', 'support.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'client', 'profile.html')));
app.get('/bug-report/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'bug-report.html'));
});

app.get('/media', (req, res) => res.sendFile(path.join(__dirname, 'client', 'media.html')));
app.get('/marketplace', (req, res) => res.sendFile(path.join(__dirname, 'client', 'marketplace.html')));
app.get('/contacts', (req, res) => res.sendFile(path.join(__dirname, 'client', 'contacts.html')));
app.get('/my/tickets', (req, res) => res.sendFile(path.join(__dirname, 'client', 'support.html')));
app.get('/my/tickets/create', (req, res) => res.sendFile(path.join(__dirname, 'client', 'support.html')));
app.get('/my/tickets/:id', (req, res) => res.sendFile(path.join(__dirname, 'client', 'support.html')));
app.get('/user/:userId', (req, res) => res.sendFile(path.join(__dirname, 'client', 'profile.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'client', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'client', 'admin.html')));
app.get('/achievements', (req, res) => res.sendFile(path.join(__dirname, 'client', 'achievements.html')));
app.get('/bugtest', (req, res) => res.sendFile(path.join(__dirname, 'client', 'bug.html')));
app.get('/beta-testing', (req, res) => res.sendFile(path.join(__dirname, 'client', 'bug.html')));
app.get('/messages', (req, res) => res.sendFile(path.join(__dirname, 'client', 'messages.html')));
app.get('/ralist', (req, res) => res.sendFile(path.join(__dirname, 'client', 'roles.html')));
app.get('/rykvo', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/departments', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/staff', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/kpis', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/reports', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/strategy', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/vacations', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/verification', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/finance', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/promocodes', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/tickets', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/complaints', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/collaborations', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/bans', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

app.get('/rykvo/logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'ryk.html'));
});

// Перенаправление старых ссылок на /leadership
app.get('/leadership', (req, res) => {
    res.redirect('/rykvo/dashboard');
});

app.get('/leadership/*', (req, res) => {
    res.redirect('/rykvo/dashboard');
});


// ============ РОУТЫ ДЛЯ MANAGER ============
app.get('/manager', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/users', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/bans', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/tickets', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/reports', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/promocodes', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/withdrawals', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/transactions', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/collaborations', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/verification', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});

app.get('/manager/analytics', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'manager.html'));
});
// Запуск сервера
app.listen(PORT, () => {
    console.log(`\n✅ Сервер успешно запущен!`);
    console.log(`📌 Адрес: http://localhost:${PORT}`);
    console.log(`🔑 Главная страница: http://localhost:${PORT}`);
    console.log(`📝 Авторизация: http://localhost:${PORT}/auth`);
    console.log(`⚙️ Админ-панель: http://localhost:${PORT}/admin/dashboard`);
});