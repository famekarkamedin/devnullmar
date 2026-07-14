const fs = require('fs');

// ============================================================
// КОНФИГУРАЦИЯ
// ============================================================
const TOTAL_TICKETS = 500;
const TOTAL_REPORTS = 200;
const TOTAL_COLLABORATIONS = 50;
const TOTAL_PROMOCODES = 30;
const TOTAL_WITHDRAWALS = 100;
const TOTAL_TRANSACTIONS = 500;
const TOTAL_GOALS = 20;
const TOTAL_VACATIONS = 80;

// ============================================================
// ДАННЫЕ ДЛЯ ГЕНЕРАЦИИ
// ============================================================
const ticketSubjects = [
    'Проблема с авторизацией', 'Не работает оплата', 'Ошибка при загрузке файла',
    'Некорректный отображение страницы', 'Проблема с уведомлениями',
    'Баги в мобильной версии', 'Списание средств', 'Не приходит подтверждение',
    'Проблемы с поиском', 'Ошибка при регистрации', 'Сброс пароля не работает',
    'Проблемы с чатом', 'Не отображается баланс', 'Проблемы с выводом средств',
    'Долгая загрузка страницы', 'Ошибка 404', 'Проблемы с фильтрацией'
];

const ticketDepartments = ['Поддержка', 'Техническая поддержка', 'Финансы', 'Безопасность', 'Модерация', 'Разработка'];
const ticketPriorities = ['low', 'medium', 'high', 'critical'];
const reportReasons = ['Спам', 'Оскорбления', 'Мошенничество', 'Неприемлемый контент', 'Нарушение правил', 'Другое'];
const collaborationTypes = ['partnership', 'advertising', 'event', 'other'];

const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'proton.me', 'mail.com', 'gmx.de', 'ukr.net'];
const prefixes = ['+7', '+380', '+1', '+44', '+49', '+48', '+33', '+39'];

const companyNames = [
    'ООО "ТехноПарк"', 'ИП "СмартСервис"', 'ЗАО "ВебИнтеграция"', 'ООО "Цифровые Решения"',
    'ИП "МаркетПродвижение"', 'ООО "БизнесПартнёр"', 'ЗАО "ИТ-Инновации"', 'ООО "КиберБезопасность"',
    'ИП "КонтентСтудия"', 'ООО "АналитикаПро"', 'ЗАО "Облачные Технологии"', 'ООО "Игровая Индустрия"'
];

const contactNames = [
    'Игорь Акулов', 'Сергей Соколов', 'Максим Волков', 'Артём Крылов',
    'Никита Морозов', 'Дмитрий Титов', 'Алексей Котов', 'Роман Громов',
    'Владислав Белов', 'Кирилл Калинин', 'Егор Баранов', 'Павел Лазарев'
];

const promoPrefixes = ['SALE', 'WELCOME', 'NEW', 'BONUS', 'GIFT', 'PROMO', 'SPECIAL', 'HOLIDAY', 'NULL', 'MARKET'];
const promoStatuses = ['active', 'active', 'active', 'inactive'];

const withdrawalDetails = ['Карта ****1234', 'СБП', 'QIWI', 'ЮMoney', 'PayPal', 'Криптовалюта'];
const transactionReasons = [
    'Пополнение баланса', 'Покупка товара', 'Вывод средств', 'Бонус за регистрацию',
    'Кешбэк', 'Реферальное вознаграждение', 'Оплата услуги', 'Возврат средств'
];

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

function randomDateStr(startDate, endDate) {
    const date = randomDate(startDate, endDate);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function generateTicketNumber() {
    return 'TKT' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
}

function generateReportNumber() {
    return 'BR' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000);
}

function generateUserId() {
    return String(Math.floor(10000000 + Math.random() * 90000000));
}

// ============================================================
// ГЕНЕРАТОР ПОЛЬЗОВАТЕЛЕЙ (только 20 для связей)
// ============================================================
function generateUsers() {
    console.log('🔄 Генерация 20 пользователей для связей...');
    let sql = '';
    const usedNames = new Set();
    const usedEmails = new Set();
    const usedIds = new Set();
    const usedPhones = new Set();
    const startDate = new Date('2025-01-25');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < 20; i++) {
        let userId;
        do {
            userId = generateUserId();
        } while (usedIds.has(userId));
        usedIds.add(userId);

        let name = random(['Игорь', 'Сергей', 'Максим', 'Артём', 'Никита', 'Дмитрий', 'Алексей', 'Роман', 'Владислав', 'Кирилл', 'Егор', 'Павел', 'Антон', 'Михаил', 'Олег', 'Даниил', 'Виктор', 'Глеб', 'Константин', 'Илья']) + ' ' + random(['Акулов', 'Соколов', 'Волков', 'Крылов', 'Морозов', 'Титов', 'Котов', 'Громов', 'Белов', 'Калинин', 'Баранов', 'Лазарев', 'Орлов', 'Фролов', 'Назаров', 'Леонов', 'Мельников', 'Фадеев', 'Жуков', 'Гусев']);
        usedNames.add(name);

        let email;
        do {
            email = Math.random().toString(36).substring(2, 8) + '@' + random(domains);
        } while (usedEmails.has(email));
        usedEmails.add(email);

        let phone;
        do {
            phone = random(prefixes) + Math.floor(100000000 + Math.random() * 900000000);
        } while (usedPhones.has(phone));
        usedPhones.add(phone);

        const created = randomDateStr(startDate, endDate);
        const passwordHash = '$2b$10$' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        const avatar = `https://ui-avatars.com/api/?background=${random(['4f46e5', '7c3aed', '2563eb', '10b981'])}&color=fff&name=${encodeURIComponent(name)}&size=40&rounded=true`;

        sql += `INSERT OR IGNORE INTO users (user_id, name, email, phone, password_hash, avatar, balance, role, status, created_at) VALUES (
            '${userId}', '${name.replace(/'/g, "''")}', '${email}', '${phone}',
            '${passwordHash}', '${avatar}', ${randomFloat(100, 50000)},
            '${random(['user', 'beta_tester', 'support_trainee', 'tech_support', 'pro_support', 'recruiter', 'head_support', 'head_moderation', 'ciso', 'ceo'])}',
            'active', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log('✅ Пользователи: 20 создано');
    return sql;
}

// ============================================================
// ГЕНЕРАТОР ТИКЕТОВ
// ============================================================
function generateTickets() {
    console.log(`🔄 Генерация ${TOTAL_TICKETS} тикетов...`);
    let sql = '';
    const startDate = new Date('2025-06-01');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < TOTAL_TICKETS; i++) {
        const user_id = randomInt(1, 20);
        const ticketNumber = generateTicketNumber();
        const subject = random(ticketSubjects);
        const message = subject + '. ' + (Math.random() > 0.5 ? 'Пожалуйста, помогите решить проблему. ' : '') + 
            'Опишите подробнее: ' + Math.random().toString(36).substring(2, 20);
        const department = random(ticketDepartments);
        const priority = random(ticketPriorities);
        // Распределение статусов для активных тикетов
        let status;
        const statusRand = Math.random();
        if (statusRand < 0.3) {
            status = 'open';
        } else if (statusRand < 0.5) {
            status = 'waiting_support';
        } else if (statusRand < 0.7) {
            status = 'waiting_user';
        } else {
            status = 'closed';
        }
        const created = randomDateStr(startDate, endDate);
        const updated = randomDateStr(new Date(created), endDate);
        
        sql += `INSERT INTO tickets (
            ticket_number, user_id, subject, message, department, priority, status, created_at, updated_at
        ) VALUES (
            '${ticketNumber}', ${user_id}, '${subject.replace(/'/g, "''")}', '${message.replace(/'/g, "''")}',
            '${department}', '${priority}', '${status}', '${created}', '${updated}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Тикеты: ${TOTAL_TICKETS} создано`);
}

// ============================================================
// ГЕНЕРАТОР ЖАЛОБ
// ============================================================
function generateReports() {
    console.log(`🔄 Генерация ${TOTAL_REPORTS} жалоб...`);
    let sql = '';
    const startDate = new Date('2025-08-01');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < TOTAL_REPORTS; i++) {
        const reporter_id = randomInt(1, 20);
        let reported_id = randomInt(1, 20);
        while (reported_id === reporter_id) {
            reported_id = randomInt(1, 20);
        }
        const reason = random(reportReasons);
        const comment = 'Комментарий к жалобе: ' + Math.random().toString(36).substring(2, 15);
        // 40% жалоб в статусе pending
        const status = Math.random() < 0.4 ? 'pending' : random(['approved', 'rejected']);
        const created = randomDateStr(startDate, endDate);
        
        sql += `INSERT INTO message_reports (
            reporter_id, reported_user_id, reason, comment, status, created_at
        ) VALUES (
            ${reporter_id}, ${reported_id}, '${reason}', '${comment.replace(/'/g, "''")}', '${status}', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Жалобы: ${TOTAL_REPORTS} создано`);
}

// ============================================================
// ГЕНЕРАТОР СОТРУДНИЧЕСТВ
// ============================================================
function generateCollaborations() {
    console.log(`🔄 Генерация ${TOTAL_COLLABORATIONS} заявок на сотрудничество...`);
    let sql = '';
    const startDate = new Date('2025-09-01');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < TOTAL_COLLABORATIONS; i++) {
        const company = random(companyNames);
        const contact = random(contactNames);
        const email = Math.random().toString(36).substring(2, 8) + '@' + random(domains);
        const phone = random(prefixes) + Math.floor(100000000 + Math.random() * 900000000);
        const type = random(collaborationTypes);
        const message = 'Хотим предложить сотрудничество. ' + Math.random().toString(36).substring(2, 30);
        const status = Math.random() < 0.4 ? 'pending' : random(['approved', 'rejected']);
        const created = randomDateStr(startDate, endDate);
        
        sql += `INSERT INTO collaborations (
            company_name, contact_name, email, phone, type, message, status, created_at
        ) VALUES (
            '${company.replace(/'/g, "''")}', '${contact}', '${email}', '${phone}',
            '${type}', '${message.replace(/'/g, "''")}', '${status}', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Сотрудничества: ${TOTAL_COLLABORATIONS} создано`);
}

// ============================================================
// ГЕНЕРАТОР ПРОМОКОДОВ
// ============================================================
function generatePromocodes() {
    console.log(`🔄 Генерация ${TOTAL_PROMOCODES} промокодов...`);
    let sql = '';
    const startDate = new Date('2025-10-01');
    const endDate = new Date('2026-06-20');
    const usedCodes = new Set();

    for (let i = 0; i < TOTAL_PROMOCODES; i++) {
        let code;
        let attempts = 0;
        do {
            code = random(promoPrefixes) + randomInt(100, 999) + random(['2025', '2026', 'SUMMER', 'WINTER', 'FEST', 'MEGA']);
            attempts++;
        } while (usedCodes.has(code) && attempts < 50);
        usedCodes.add(code);
        
        const discountType = Math.random() > 0.5 ? 'percent' : 'fixed';
        const discountValue = discountType === 'percent' ? randomInt(5, 50) : randomInt(50, 500);
        const maxUses = Math.random() > 0.3 ? randomInt(10, 100) : null;
        const usedCount = maxUses ? randomInt(0, Math.min(maxUses, 50)) : randomInt(0, 30);
        const isActive = Math.random() > 0.2;
        const created = randomDateStr(startDate, endDate);
        
        sql += `INSERT INTO promocodes (
            code, discount_type, discount_value, max_uses, used_count, is_active, created_at
        ) VALUES (
            '${code}', '${discountType}', ${discountValue}, ${maxUses || 'NULL'}, ${usedCount}, ${isActive ? 1 : 0}, '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Промокоды: ${TOTAL_PROMOCODES} создано`);
}

// ============================================================
// ГЕНЕРАТОР ЗАЯВОК НА ВЫВОД
// ============================================================
function generateWithdrawals() {
    console.log(`🔄 Генерация ${TOTAL_WITHDRAWALS} заявок на вывод...`);
    let sql = '';
    const startDate = new Date('2025-08-01');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < TOTAL_WITHDRAWALS; i++) {
        const user_id = randomInt(1, 20);
        const amount = randomFloat(100, 50000);
        const detail = random(withdrawalDetails) + ' ' + Math.floor(Math.random() * 10000);
        // 30% заявок в статусе pending
        const status = Math.random() < 0.3 ? 'pending' : random(['approved', 'rejected']);
        const created = randomDateStr(startDate, endDate);
        const processed = status !== 'pending' ? randomDateStr(new Date(created), endDate) : null;
        
        sql += `INSERT INTO withdrawals (
            user_id, amount, details, status, created_at, processed_at
        ) VALUES (
            ${user_id}, ${amount}, '${detail}', '${status}', '${created}', ${processed ? "'" + processed + "'" : 'NULL'}
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Заявки на вывод: ${TOTAL_WITHDRAWALS} создано`);
}

// ============================================================
// ГЕНЕРАТОР ТРАНЗАКЦИЙ
// ============================================================
function generateTransactions() {
    console.log(`🔄 Генерация ${TOTAL_TRANSACTIONS} транзакций...`);
    let sql = '';
    const startDate = new Date('2025-06-01');
    const endDate = new Date('2026-06-20');

    for (let i = 0; i < TOTAL_TRANSACTIONS; i++) {
        const user_id = randomInt(1, 20);
        const isIncome = Math.random() > 0.4;
        const amount = isIncome ? randomFloat(50, 10000) : randomFloat(-10000, -50);
        const reason = random(transactionReasons) + (Math.random() > 0.3 ? ' #' + Math.floor(Math.random() * 1000) : '');
        const created = randomDateStr(startDate, endDate);
        
        sql += `INSERT INTO balance_history (
            user_id, amount, reason, created_at
        ) VALUES (
            ${user_id}, ${amount}, '${reason.replace(/'/g, "''")}', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Транзакции: ${TOTAL_TRANSACTIONS} создано`);
}

// ============================================================
// ГЕНЕРАТОР СТРАТЕГИЧЕСКИХ ЦЕЛЕЙ
// ============================================================
function generateGoals() {
    console.log(`🔄 Генерация ${TOTAL_GOALS} стратегических целей...`);
    let sql = '';
    const startDate = new Date('2025-07-01');
    const endDate = new Date('2026-12-31');

    const goalTitles = [
        'Улучшение CSAT до 95%', 'Запуск новой версии платформы',
        'Расширение отдела поддержки', 'Внедрение системы KPI',
        'Стратегия развития на 2026', 'Увеличение выручки на 30%',
        'Запуск мобильного приложения', 'Выход на международный рынок',
        'Автоматизация процессов', 'Улучшение безопасности данных',
        'Разработка AI-помощника', 'Интеграция с внешними сервисами',
        'Обновление дизайна', 'Оптимизация скорости работы',
        'Внедрение системы аналитики', 'Создание партнёрской программы',
        'Запуск образовательного блока', 'Разработка API для партнёров',
        'Модернизация инфраструктуры', 'Внедрение системы мониторинга'
    ];

    const goalDescriptions = [
        'Повысить удовлетворённость пользователей до 95% к концу квартала',
        'Релиз NULLMARKET 3.0 с новым дизайном и функционалом',
        'Нанять 5 новых сотрудников в отдел поддержки',
        'Разработать и внедрить систему ключевых показателей для всех отделов',
        'Разработать стратегию развития компании на 2026 год',
        'Увеличить выручку на 30% за счёт новых направлений',
        'Создать мобильное приложение для iOS и Android',
        'Выйти на рынки СНГ и Европы',
        'Автоматизировать рутинные процессы',
        'Улучшить систему безопасности и защиты данных'
    ];

    const statuses = ['pending', 'in_progress', 'completed'];

    for (let i = 0; i < TOTAL_GOALS; i++) {
        const title = goalTitles[i % goalTitles.length];
        const description = goalDescriptions[i % goalDescriptions.length];
        const progress = randomInt(0, 100);
        const deadline = randomDateStr(startDate, endDate);
        const status = statuses[randomInt(0, 2)];
        const created = randomDateStr(new Date('2025-05-01'), new Date('2026-01-01'));
        
        sql += `INSERT INTO strategic_goals (
            title, description, progress, deadline, status, created_at
        ) VALUES (
            '${title.replace(/'/g, "''")}', '${description.replace(/'/g, "''")}',
            ${progress}, '${deadline}', '${status}', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Стратегические цели: ${TOTAL_GOALS} создано`);
}

// ============================================================
// ГЕНЕРАТОР ОТПУСКОВ
// ============================================================
function generateVacations() {
    console.log(`🔄 Генерация ${TOTAL_VACATIONS} заявок на отпуск...`);
    let sql = '';
    const startDate = new Date('2025-06-01');
    const endDate = new Date('2026-08-31');

    const userNames = [
        'Игорь Акулов', 'Сергей Соколов', 'Максим Волков', 'Артём Крылов',
        'Никита Морозов', 'Дмитрий Титов', 'Алексей Котов', 'Роман Громов',
        'Владислав Белов', 'Кирилл Калинин', 'Егор Баранов', 'Павел Лазарев'
    ];

    const statuses = ['pending', 'approved', 'rejected'];

    for (let i = 0; i < TOTAL_VACATIONS; i++) {
        const user_name = random(userNames);
        const user_id = randomInt(1, 20);
        const start = randomDateStr(startDate, endDate);
        const end = randomDateStr(new Date(start), new Date(new Date(start).getTime() + 14 * 24 * 60 * 60 * 1000));
        const status = random(statuses);
        const department_id = randomInt(1, 6);
        const created = randomDateStr(new Date('2025-05-01'), new Date('2026-06-01'));
        
        sql += `INSERT INTO vacations (
            user_id, user_name, department_id, start_date, end_date, status, created_at
        ) VALUES (
            ${user_id}, '${user_name.replace(/'/g, "''")}', ${department_id}, '${start}', '${end}', '${status}', '${created}'
        );\n`;
    }

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ Отпуска: ${TOTAL_VACATIONS} создано`);
}

// ============================================================
// ГЕНЕРАТОР KPI
// ============================================================
function generateKPIs() {
    console.log('🔄 Генерация KPI...');
    let sql = '';

    const kpis = [
        { name: 'Среднее время ответа', value: '2.4 мин', target: '3 мин', status: 'success', trend: 'up' },
        { name: 'CSAT (удовлетворённость)', value: '94%', target: '90%', status: 'success', trend: 'up' },
        { name: 'Разрешение тикетов', value: '87%', target: '85%', status: 'success', trend: 'up' },
        { name: 'Среднее время решения', value: '4.2 часа', target: '6 часов', status: 'success', trend: 'down' },
        { name: 'Количество обращений', value: '1,247', target: '1,200', status: 'warning', trend: 'up' },
        { name: 'Эффективность отдела', value: '92%', target: '90%', status: 'success', trend: 'up' }
    ];

    kpis.forEach(k => {
        sql += `INSERT OR IGNORE INTO kpis (name, value, target, status, trend) VALUES (
            '${k.name}', '${k.value}', '${k.target}', '${k.status}', '${k.trend}'
        );\n`;
    });

    fs.appendFileSync('test_data.sql', sql);
    console.log(`✅ KPI: ${kpis.length} создано`);
}

// ============================================================
// ЗАПУСК ВСЕХ ГЕНЕРАТОРОВ
// ============================================================
console.log('\n🚀 НАЧАЛО ГЕНЕРАЦИИ ТЕСТОВЫХ ДАННЫХ');
console.log('='.repeat(50));

// Очищаем файл перед записью
fs.writeFileSync('test_data.sql', '-- Тестовые данные для NULLMARKET\n-- Сгенерировано: ' + new Date().toISOString() + '\n\n');

// Запускаем генераторы последовательно
console.log('\n📊 Генерация данных...\n');

// Сначала пользователи
generateUsers();

// Затем все остальные
setTimeout(() => {
    generateTickets();
}, 500);

setTimeout(() => {
    generateReports();
}, 1000);

setTimeout(() => {
    generateCollaborations();
}, 1500);

setTimeout(() => {
    generatePromocodes();
}, 2000);

setTimeout(() => {
    generateWithdrawals();
}, 2500);

setTimeout(() => {
    generateTransactions();
}, 3000);

setTimeout(() => {
    generateGoals();
}, 3500);

setTimeout(() => {
    generateVacations();
}, 4000);

setTimeout(() => {
    generateKPIs();
}, 4500);

setTimeout(() => {
    console.log('\n' + '='.repeat(50));
    console.log('✅ ВСЕ ДАННЫЕ СГЕНЕРИРОВАНЫ');
    const stats = fs.statSync('test_data.sql');
    console.log(`📁 Файл: test_data.sql (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('\n📊 ИТОГО СОЗДАНО:');
    console.log(`   👤 Пользователей: 20 (для связей)`);
    console.log(`   🎫 Тикетов: ${TOTAL_TICKETS} (в т.ч. активных ~${Math.round(TOTAL_TICKETS * 0.7)})`);
    console.log(`   📋 Жалоб на рассмотрении: ~${Math.round(TOTAL_REPORTS * 0.4)} (pending)`);
    console.log(`   🤝 Сотрудничеств: ${TOTAL_COLLABORATIONS} (в т.ч. ожидающих ~${Math.round(TOTAL_COLLABORATIONS * 0.4)})`);
    console.log(`   🏷️ Промокодов: ${TOTAL_PROMOCODES}`);
    console.log(`   💳 Заявок на вывод: ${TOTAL_WITHDRAWALS} (в т.ч. ожидающих ~${Math.round(TOTAL_WITHDRAWALS * 0.3)})`);
    console.log(`   💰 Транзакций: ${TOTAL_TRANSACTIONS}`);
    console.log(`   🎯 Стратегических целей: ${TOTAL_GOALS}`);
    console.log(`   🌴 Отпусков: ${TOTAL_VACATIONS}`);
    console.log(`   📊 KPI: 6`);
    console.log('='.repeat(50));
    console.log('\n📌 Для импорта выполните: sqlite3 nullmarket.db < test_data.sql');
}, 5000);