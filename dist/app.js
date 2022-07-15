"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const grammy_1 = require("grammy");
const timers_1 = require("timers");
const TonWeb = require('tonweb');
const BN = TonWeb.utils.BN;
const toNano = TonWeb.utils.toNano;
const tonMnemonic = require("tonweb-mnemonic");
const apiKey = process.env.TONWEBTOKEN;
var mysql = require('mysql2');
function Payment(state, s) {
    try {
        const su = s.toFixed(4);
        const newState = Object.assign({}, state);
        newState.balanceA = state.balanceA.sub(toNano(su));
        newState.balanceB = state.balanceB.add(toNano(su));
        newState.seqnoA = state.seqnoA.add(new BN(1));
        newState.seqnoB = state.seqnoB.add(new BN(1));
        return newState;
    }
    catch (error) {
        console.log(error);
    }
}
async function CloseContract(contract) {
    try {
        const signatureCloseS = await contract.channelS.signClose(contract.currentState);
        await contract.channelV.verifyClose(contract.currentState, signatureCloseS);
        await contract.fromWalletV.close(Object.assign(Object.assign({}, contract.currentState), { hisSignature: signatureCloseS })).send(toNano('0.05'));
    }
    catch (error) {
        console.log(error);
    }
}
async function initWallet(apiKey, seedS, seedV, fullPrice, initId) {
    try {
        var tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC', { apiKey: apiKey }));
        //variable creation
        const WalletClass = tonweb.wallet.all["v3R2"];
        const keyPairS = tonweb.utils.keyPairFromSeed(seedS);
        const keyPairV = tonweb.utils.keyPairFromSeed(seedV);
        const walletS = new WalletClass(tonweb.provider, { publicKey: keyPairS.publicKey, wc: 0 });
        const walletV = new WalletClass(tonweb.provider, { publicKey: keyPairV.publicKey, wc: 0 });
        const walletAddressS = await walletS.getAddress();
        const walletAddressV = await walletV.getAddress();
        const channelInitState = {
            balanceA: toNano(fullPrice.toFixed(4)), balanceB: toNano('0'),
            seqnoA: new BN(0), seqnoB: new BN(0)
        };
        const channelConfig = {
            channelId: new BN(initId.toString()),
            addressA: walletAddressV, addressB: walletAddressS,
            initBalanceA: channelInitState.balanceA, initBalanceB: channelInitState.balanceB
        };
        const channelS = tonweb.payments.createChannel(Object.assign(Object.assign({}, channelConfig), { isA: false, myKeyPair: keyPairS, hisPublicKey: keyPairV.publicKey }));
        const channelV = tonweb.payments.createChannel(Object.assign(Object.assign({}, channelConfig), { isA: true, myKeyPair: keyPairV, hisPublicKey: keyPairS.publicKey }));
        const fromWalletS = channelS.fromWallet({ wallet: walletS, secretKey: keyPairS.secretKey });
        const fromWalletV = channelV.fromWallet({ wallet: walletV, secretKey: keyPairV.secretKey });
        const channelAddress = (await channelS.getAddress()).toString(true, true, true);
        console.log(channelAddress);
        await fromWalletV.deploy().send(toNano('0.03'));
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                await fromWalletV
                    .topUp({ coinsA: channelInitState.balanceA, coinsB: new BN(0) })
                    .send(channelInitState.balanceA.add(toNano('0.03')));
                setTimeout(async () => {
                    await fromWalletV.init(channelInitState).send(toNano('0.03'));
                }, 1000 * 5);
                resolve({
                    currentState: channelInitState,
                    channelS: channelS,
                    channelV: channelV,
                    fromWalletV: fromWalletV,
                    channelAddress: channelAddress
                });
            }, 1000 * 10);
        });
    }
    catch (error) {
        console.log(error);
    }
}
var connection = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'tonstreams',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
const token = process.env.TELETOKEN;
const botname = 'tonstreams_bot';
function initialCreationData() {
    return {
        channelId: -1,
        minutesLength: -1,
        price: -1
    };
}
function initialSession() {
    return {
        messageStatus: '',
        creationData: initialCreationData()
    };
}
;
let creatingStreams = {};
let streamWatchers = {};
let runningContracts = {};
const bot = new grammy_1.Bot(token);
bot.use((0, grammy_1.session)({ initial: initialSession }));
function createCallback(action, data = {}) {
    return JSON.stringify({
        a: action,
        d: data
    });
}
function unix2string(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('ru-RU');
}
const mainMenuKeyboard = new grammy_1.InlineKeyboard()
    .text('Оплаченные трансляции', createCallback('bought_streams')).row()
    .text('Созданные трансляции', createCallback('created_streams')).row()
    .text('Авторизация кошелька', createCallback('authorize_wallet')).row();
const mainMenuText = 'TON streams - платные трансляции на TON';
bot.catch((err) => {
    const e = err.error;
    if (!(e instanceof grammy_1.GrammyError)) {
        console.log(e['description']);
    }
});
bot.on('chat_join_request', async (ctx) => {
    try {
        connection.execute('SELECT * from subscriptions WHERE userId = ? AND channelID = ? And active = ? ORDER BY id DESC', [ctx.chatJoinRequest.from.id, ctx.chatJoinRequest.chat.id, true], async (err, results, fields) => {
            if (results) {
                if (results.length != 0) {
                    await ctx.approveChatJoinRequest(ctx.chatJoinRequest.from.id);
                }
                else {
                    await ctx.declineChatJoinRequest(ctx.chatJoinRequest.from.id);
                }
            }
            else {
                await ctx.declineChatJoinRequest(ctx.chatJoinRequest.from.id);
            }
        });
    }
    catch (error) {
        console.log(error);
    }
});
bot.on(['channel_post:video_chat_scheduled'], async (ctx) => {
    try {
        const admins = (await bot.api.getChatAdministrators(ctx.chat.id)).filter(t => !t.user.is_bot);
        // add to temp dict
        let streamToAdd = {
            scheduledDate: ctx.channelPost.video_chat_scheduled.start_date,
            channelId: ctx.channelPost.chat.id,
            creatorId: 0,
            channelName: ctx.channelPost.chat['title'],
            channelLink: (await ctx.api.createChatInviteLink(ctx.chat.id, {
                creates_join_request: true
            })).invite_link,
            price: 0,
            plannedLength: 0,
            started: false,
            ended: false,
            botLink: ''
        };
        creatingStreams[ctx.chat.id] = streamToAdd;
        for (const admin of admins.map(t => t.user.id))
            ctx.api.sendMessage(admin, `Обнаружена запланированная трансляция в канале "${ctx.channelPost.chat['title']}"`, {
                reply_markup: new grammy_1.InlineKeyboard().text('Настроить трансляцию', createCallback('setup_stream', { channelId: ctx.chat.id }))
            });
    }
    catch (error) {
        console.log(error);
    }
});
async function watchStream(channelId, streamId, pricePerCheck) {
    connection.execute('SELECT * FROM subscriptions WHERE streamId = ? AND active = ? ORDER BY id DESC', [streamId, true], async (err, streamSubs, fields) => {
        const subsAvailability = await Promise.all(streamSubs.map(async (sub) => bot.api.getChatMember(channelId, sub.userId)));
        for (let i = 0; i < streamSubs.length; i++) {
            if (subsAvailability[i]) {
                runningContracts[parseInt(streamSubs[i].contract)].currentState = Payment(runningContracts[parseInt(streamSubs[i].contract)].currentState, pricePerCheck);
            }
        }
    });
}
bot.on('channel_post:video_chat_started', async (ctx) => {
    try {
        connection.execute('SELECT * FROM streams WHERE channelId = ? AND ended = ? ORDER BY id DESC', [ctx.channelPost.chat.id, false], async (err, results, fields) => {
            if (results.length != 0) {
                const foundStream = results[0];
                connection.query('UPDATE streams SET started = ? WHERE id = ?', [true, foundStream.streamId], async (err, results, fields) => { });
                connection.execute('SELECT * FROM subscriptions WHERE channelId = ? AND active = ? ORDER BY id DESC', [ctx.channelPost.chat.id, true], async (err, subs, fields) => {
                    for (const sub of subs) {
                        ctx.api.sendMessage(sub.userId, `Трансляция началась!\nСсылка: ${sub.channelLink}`);
                    }
                });
                const checkInterval = 5;
                const streamWatcher = setInterval(async () => await watchStream(foundStream.channelId, foundStream.id, (foundStream.price / (foundStream.plannedLength * 60) * checkInterval)), 1000 * checkInterval);
                streamWatchers[foundStream.id] = streamWatcher;
            }
        });
    }
    catch (error) {
        console.log(error);
    }
});
bot.on('channel_post:video_chat_ended', async (ctx) => {
    try {
        connection.execute('SELECT * FROM subscriptions WHERE channelId = ? AND active = ? ORDER BY id DESC', [ctx.channelPost.chat.id, true], async (err, results, fields) => {
            if (results) {
                if (results.length != 0) {
                    for (const sub of results) {
                        await CloseContract(runningContracts[parseInt(sub.contract)]);
                    }
                    setTimeout(async () => {
                        connection.query('UPDATE subscriptions SET active = ? WHERE channelId = ?', [false, ctx.channelPost.chat.id], async (err, results, fields) => { });
                        connection.query('UPDATE streams SET ended = ? WHERE channelId = ?', [true, ctx.channelPost.chat.id], async (err, results, fields) => { });
                    }, 200);
                    (0, timers_1.clearInterval)(streamWatchers[results[0].streamId]);
                }
            }
        });
    }
    catch (error) {
        console.log(error);
    }
});
bot.command(['start', 'menu'], async (ctx) => {
    try {
        let splitted = ctx.message.text.split(' ');
        if (splitted[0] == '/start') {
            await ctx.reply('Для использования бота следует:\n - Указать мнемонику\n - Добавить бота в виде админа в канал\n - Сделать канал приватным');
        }
        if (splitted.length > 1) {
            const streamId = parseInt(splitted[1]);
            connection.execute('SELECT * FROM streams WHERE id = ? ORDER BY id DESC', [streamId], async (err, results, fields) => {
                if (results.length != 0) {
                    const stream = results[0];
                    await ctx.reply(`Оплата трансляции\nДата проведения: ${unix2string(stream.scheduledDate)}\nЦена: ${stream.price}TON`, {
                        reply_markup: new grammy_1.InlineKeyboard().text('Оплатить', createCallback('initiate_payment', { streamId: streamId })).row()
                    });
                }
                else {
                    await ctx.reply('Ошибка: трансляция не найдена');
                    await ctx.reply(mainMenuText, {
                        reply_markup: mainMenuKeyboard
                    });
                }
            });
        }
        else {
            await ctx.reply(mainMenuText, {
                reply_markup: mainMenuKeyboard
            });
        }
    }
    catch (error) {
        console.log(error);
    }
});
bot.on('message:text', async (ctx) => {
    try {
        if (ctx.session.messageStatus == 'setup_stream') {
            if (ctx.session.creationData.minutesLength < 0) {
                let parsedLength = parseInt(ctx.message.text) || 0;
                if (parsedLength > 0) {
                    ctx.session.creationData.minutesLength = parsedLength;
                    ctx.reply('Стоимость всей трансляции для одного пользователя, в TON:');
                }
            }
            else if (ctx.session.creationData.price < 0) {
                let parsedPrice = parseFloat(ctx.message.text) || 0;
                if (parsedPrice > 0) {
                    ctx.session.creationData.price = parsedPrice;
                    ctx.session.messageStatus = '';
                    let createdStream = creatingStreams[ctx.session.creationData.channelId];
                    createdStream.plannedLength = ctx.session.creationData.minutesLength;
                    createdStream.price = ctx.session.creationData.price;
                    createdStream.creatorId = ctx.message.chat.id;
                    connection.query('INSERT INTO streams SET ?', createdStream, async (err, results, fields) => {
                        const botLink = `https://t.me/${botname}?start=${results.insertId}`;
                        connection.query('UPDATE streams SET botLink = ?', [botLink], async (err, results, fields) => {
                            ctx.session.creationData = initialCreationData();
                            await ctx.reply(`Трансляция добавлена\nСсылка на оплату: ${botLink}\n${mainMenuText}`, {
                                reply_markup: mainMenuKeyboard
                            });
                        });
                    });
                }
            }
        }
        else if (ctx.session.messageStatus == 'enter_mnemonic') {
            let userId = undefined;
            const complete = async () => {
                ctx.session.messageStatus = '';
                await ctx.reply('Mnemonic добавлен ✅\n' + mainMenuText, {
                    reply_markup: mainMenuKeyboard
                });
            };
            connection.execute('SELECT FROM users WHERE userId = ?', [ctx.message.chat.id], (err, results, fields) => {
                if (results) {
                    connection.query('UPDATE users SET seedPhrase = ? WHERE userId = ?', [ctx.message.text, ctx.message.chat.id], (err, results, fields) => {
                        complete();
                    });
                    userId = results[0];
                }
                else {
                    connection.query('INSERT INTO users SET ?', { seedPhrase: ctx.message.text, userId: ctx.message.chat.id }, (err, results, fields) => {
                        complete();
                    });
                }
            });
        }
    }
    catch (error) {
        console.log(error);
    }
});
bot.on('callback_query:data', async (ctx) => {
    try {
        const parsedCallback = JSON.parse(ctx.callbackQuery.data);
        const action = parsedCallback.a;
        const data = parsedCallback.d;
        if (action == 'main_menu') {
            await ctx.editMessageText(mainMenuText);
            await ctx.editMessageReplyMarkup({
                reply_markup: mainMenuKeyboard
            });
        }
        else if (action == 'created_streams') {
            connection.execute('SELECT * FROM streams WHERE creatorId = ? AND ended = ? ORDER BY id DESC', [ctx.callbackQuery.message.chat.id, false], async (err, results, fields) => {
                let createdStreamsKeyboard = new grammy_1.InlineKeyboard();
                for (const stream of results) {
                    createdStreamsKeyboard.text(`${stream.channelName} - ${unix2string(stream.scheduledDate)}`, createCallback('sd', { id: stream.id, cb: 'c' })).row();
                }
                await ctx.editMessageText('Созданные трансляции: ');
                await ctx.editMessageReplyMarkup({
                    reply_markup: createdStreamsKeyboard.text('< Назад', createCallback('main_menu')).row()
                });
                await ctx.answerCallbackQuery();
            });
        }
        else if (action == 'sd') {
            connection.execute('SELECT * FROM streams WHERE id = ? ORDER BY id DESC', [data.id], async (err, results, fields) => {
                const stream = results[0];
                await ctx.editMessageText('Информация о трансляции:\n' +
                    `Ссылка: ${stream.botLink}\n` +
                    `Канал: ${data.cb == 'b' ? stream.channelName : stream.channelLink}\n` +
                    `Дата: ${unix2string(stream.scheduledDate)}\n` +
                    `Продолжительность: ${stream.plannedLength}\n` +
                    `Стоимость: ${stream.price} TON`);
                let detailsKeyboard = new grammy_1.InlineKeyboard();
                if (data.cb == 'b') {
                    detailsKeyboard = detailsKeyboard.text('Отменить', createCallback('cs', { id: stream.id })).row();
                }
                detailsKeyboard = detailsKeyboard.text('< Назад', createCallback(data.cb == 'b' ? 'bought_streams' : 'created_streams')).row();
                await ctx.editMessageReplyMarkup({
                    reply_markup: detailsKeyboard
                });
                await ctx.answerCallbackQuery();
            });
        }
        else if (action == 'setup_stream') {
            ctx.session.messageStatus = 'setup_stream';
            ctx.session.creationData.channelId = data.channelId;
            ctx.answerCallbackQuery();
            ctx.reply('Продолжительность трансляции в минутах: ');
        }
        else if (action == 'bought_streams') {
            connection.execute('SELECT * FROM subscriptions INNER JOIN streams ON subscriptions.streamId=streams.id WHERE userId = ? AND active = ? ORDER BY id DESC', [ctx.callbackQuery.message.chat.id, true], async (err, results, fields) => {
                const userStreams = results;
                let userStreamsKeyboard = new grammy_1.InlineKeyboard();
                if (results) {
                    for (const stream of userStreams) {
                        userStreamsKeyboard.text(`${stream.channelName} - ${unix2string(stream.scheduledDate)}`, createCallback('sd', { id: stream.id, cb: 'b' })).row();
                    }
                }
                await ctx.editMessageText('Оплаченные трансляции:');
                await ctx.editMessageReplyMarkup({
                    reply_markup: userStreamsKeyboard.text('< Назад', createCallback('main_menu')).row()
                });
            });
        }
        else if (action == 'initiate_payment') {
            connection.execute('SELECT * FROM streams WHERE id = ? ORDER BY id DESC', [data.streamId], async (err, results, fields) => {
                const stream = results[0];
                const subscription = { userId: ctx.chat.id, streamId: data.streamId, channelId: stream['channelId'], timesPaid: 0, contract: '', active: true, channelLink: stream.channelLink };
                connection.execute('SELECT * FROM users WHERE userId = ? ORDER BY id DESC', [ctx.callbackQuery.message.chat.id], async (err, results, fields) => {
                    const seedV = await tonMnemonic.mnemonicToSeed(results[0].seedPhrase.split(' '));
                    connection.execute('SELECT * FROM users WHERE userId = ? ORDER BY id DESC', [stream.creatorId], async (err, results, fields) => {
                        const seedS = await tonMnemonic.mnemonicToSeed(results[0].seedPhrase.split(' '));
                        const initId = Math.floor(Math.random() * 1000000);
                        subscription.contract = initId.toString();
                        initWallet(apiKey, seedS, seedV, stream.price, initId).then(contract => {
                            runningContracts[initId] = contract;
                            subscription['contractHash'] = contract['channelAddress'];
                            connection.query('INSERT INTO subscriptions SET ?', subscription, async (err, results, fields) => {
                                await ctx.editMessageText('Оплата проведена ✅');
                                await ctx.reply(mainMenuText, {
                                    reply_markup: mainMenuKeyboard
                                });
                            });
                        });
                    });
                });
            });
        }
        else if (action == 'authorize_wallet') {
            await ctx.editMessageText('Авторизация кошелька');
            await ctx.editMessageReplyMarkup({
                reply_markup: new grammy_1.InlineKeyboard()
                    .text('Ввести mnemonic', createCallback('enter_mnemonic')).row()
                    .text('< Назад', createCallback('main_menu')).row()
            });
        }
        else if (action == 'enter_mnemonic') {
            ctx.session.messageStatus = 'enter_mnemonic';
            await ctx.editMessageText('Скопируйте и вставьте mnemonic:');
            await ctx.answerCallbackQuery();
        }
        else if (action == 'cs') { //cancel_subscription
            connection.execute('SELECT * FROM subscriptions WHERE streamId = ? AND userId = ? ORDER BY id DESC', [data.id, ctx.callbackQuery.message.chat.id], async (err, results, fields) => {
                const subscription = results[0];
                await CloseContract(runningContracts[parseInt(subscription.contract)]);
                connection.query('UPDATE subscriptions SET active = ? WHERE id = ?', [false, subscription.id]);
                await ctx.editMessageText('Оплата отменена ✅');
                await ctx.reply(mainMenuText, {
                    reply_markup: mainMenuKeyboard
                });
            });
        }
    }
    catch (error) {
        console.log(error);
    }
});
bot.start();
//# sourceMappingURL=app.js.map