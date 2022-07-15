const TonWeb = require('tonweb');
const tonMnemonic = require("tonweb-mnemonic");
const BN = TonWeb.utils.BN;
const toNano = TonWeb.utils.toNano;
async function main() {
    const price = 0.2;
    const apiKey = '8974fe64005f6b83dd61eb270ad143b3c48850bc14314d69a8bad848037c306b';
    const tonweb = new TonWeb(new TonWeb.HttpProvider('https://testnet.toncenter.com/api/v2/jsonRPC', { apiKey: apiKey }));
    const WalletClass = tonweb.wallet.all["v3R2"];
    const wordsS = 'tissue decade sunny alpha dry dose coconut earn idle jewel suggest laundry slot ugly fault marble beach educate easily squeeze lunar evil over mix'.split(' ');
    const wordsV = 'tissue decade sunny alpha dry dose coconut earn idle jewel suggest laundry slot ugly fault marble beach educate easily squeeze lunar evil over mix'.split(' ');
    const seedS = await tonMnemonic.mnemonicToSeed(wordsS);
    const seedV = await tonMnemonic.mnemonicToSeed(wordsV);
    const keyPairS = tonweb.utils.keyPairFromSeed(seedS);
    const keyPairV = tonweb.utils.keyPairFromSeed(seedV);
    const walletS = new WalletClass(tonweb.provider, {
        publicKey: keyPairS.publicKey,
        wc: 0
    });
    const walletV = new WalletClass(tonweb.provider, {
        publicKey: keyPairV.publicKey,
        wc: 0
    });
    const walletAddressS = await walletS.getAddress();
    const walletAddressV = await walletV.getAddress();
    const channelInitState = {
        balanceA: toNano(price.toString()),
        balanceB: toNano('0'),
        seqnoA: new BN(0),
        seqnoB: new BN(0)
    };
    const channelConfig = {
        channelId: new BN(129),
        addressA: walletAddressV,
        addressB: walletAddressS,
        initBalanceA: channelInitState.balanceA,
        initBalanceB: channelInitState.balanceB
    };
    const channelS = tonweb.payments.createChannel(Object.assign(Object.assign({}, channelConfig), { isA: false, myKeyPair: keyPairS, hisPublicKey: keyPairV.publicKey }));
    const channelV = tonweb.payments.createChannel(Object.assign(Object.assign({}, channelConfig), { isA: true, myKeyPair: keyPairV, hisPublicKey: keyPairS.publicKey }));
    const channelAddress = await channelS.getAddress();
    console.log(channelAddress.toString(true, true, true));
    const fromWalletS = channelS.fromWallet({
        wallet: walletS,
        secretKey: keyPairS.secretKey
    });
    const fromWalletV = channelV.fromWallet({
        wallet: walletV,
        secretKey: keyPairV.secretKey
    });
    //await fromWalletV.deploy().send(toNano('0.05'));
    /*
    await fromWalletV
        .topUp({coinsA: channelInitState.balanceA, coinsB: new BN(0)})
        .send(channelInitState.balanceA.add(toNano('0.05')));
    */
    //check state
    /*
    console.log(await channelV.getChannelState());
    const data = await channelV.getData();
    console.log('balanceV = ', data.balanceA.toString())
    console.log('balanceS = ', data.balanceB.toString())
    console.log(data);
    */
    //init wallet
    //await fromWalletV.init(channelInitState).send(toNano('0.05'));
    //one payment
    const currentState = channelInitState;
    const newState = Payment(currentState, '0.2');
    const signV = await channelV.signState(newState);
    const signS = await channelS.signState(newState);
    //close contract
    const signatureCloseS = await channelS.signClose(newState);
    console.log(await channelV.verifyClose(newState, signatureCloseS));
    await fromWalletV.close(Object.assign(Object.assign({}, newState), { hisSignature: signatureCloseS })).send(toNano('0.05'));
}
async function initWallet(apiKey, seedS, seedV, fullPrice, initId) {
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
        balanceA: toNano(fullPrice.toString()), balanceB: toNano('0'),
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
            await fromWalletV.init(channelInitState).send(toNano('0.03'));
            console.log('inited');
            resolve({
                currentState: channelInitState,
                channelS: channelS,
                channelV: channelV,
                fromWalletV: fromWalletV
            });
        }, 1000 * 10);
    });
}
function Payment(state, s) {
    const newState = Object.assign({}, state);
    newState.balanceA = state.balanceA.sub(toNano(s.toString()));
    newState.balanceB = state.balanceB.add(toNano(s.toString()));
    newState.seqnoA = state.seqnoA.add(new BN(1));
    newState.seqnoB = state.seqnoB.add(new BN(1));
    return newState;
}
async function CloseContract(contract) {
    const signatureCloseS = await contract.channelS.signClose(contract.currentState);
    await contract.channelV.verifyClose(contract.currentState, signatureCloseS);
    await contract.fromWalletV.close(Object.assign(Object.assign({}, contract.currentState), { hisSignature: signatureCloseS })).send(toNano('0.05'));
}
(async () => {
    const apiKey = '8974fe64005f6b83dd61eb270ad143b3c48850bc14314d69a8bad848037c306b';
    const words = 'tissue decade sunny alpha dry dose coconut earn idle jewel suggest laundry slot ugly fault marble beach educate easily squeeze lunar evil over mix'.split(' ');
    const seedS = await tonMnemonic.mnemonicToSeed(words);
    const seedV = await tonMnemonic.mnemonicToSeed(words);
    initWallet(apiKey, seedS, seedV, 1.0, 147).then(contract => {
        console.log(contract['currentState']);
        contract['currentState'] = Payment(contract['currentState'], 0.9);
        console.log(contract['currentState']);
        setTimeout(async () => {
            await CloseContract(contract);
            console.log('closed');
        }, 1000 * 10);
    });
})();
//# sourceMappingURL=test.js.map