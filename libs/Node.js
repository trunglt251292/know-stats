import {request} from "./request";
import config from '../config';
const _ = require('lodash');
import globalConstants from '../globalConstants';
import {callAPI} from "./request";

/**
 * Thread
 * 1. checknode
 * 2. init
 * 3. setWatches
 * 4. sendUpdateStat
 * 5. emit
 * */

const api = {
  status:'/api/v2/node/status',
  configuration:'/api/v2/node/configuration',
  block:'/api/v2/blocks?limit=1',
  delegate:'/api/v2/delegates',
  peers:'/api/v2/peers',
  getblock:'/api/v2/blocks?height='
};

function Node(io) {
  this.io = io;
  this.timeblock = [];
  this.transactions = [];
  this.info = {
    version: '2.0.0',
    username: '',
    height:0,
    latency:100,
    system: config.peers[0].os,
    uncles:0,
    blockId: '',
    voteBalance:0,
    producedBlocks:0,
    missBlocks: 0,
    transactionBlock: 0
  };
  this.status = false;
  this.location = 0;
  this.limit_peer = 0;
  this.ip_node = config.peers[0].host;
  this.port = config.peers[0].port;
  this.uri = (config.peers[0].ssl ? 'https://':'http://')+''+config.peers[0].host+':'+config.peers[0].port;
  this.timeSendBlock = 0;
  this.ssl = config.peers[0].ssl;
  this.peers = [];
  this.blockHeight = 0;
  this.stats = {
    active: false,
    forging: false,
    peers: 5,
    badPeers: 0,
    pending: 0, // deprecated
    delegateCount: 0,
    block: {
      number: 0,
      hash: '?',
      difficulty: 0,
      totalDifficulty: 0,
      transactions: 0,
      uncles: [], // deprecated
      forger: {
        username: '',
        address: '',
        publicKey:'',
        rate: '',
        productivity: 0,
        approval: 0
      },
    },
    syncing: false,
    uptime: 100 // deprecated
  };
  this.versionInfo = {};
  this.checknode();
}

Node.prototype.checknode = async function () {
  try{
    let self = this;
    let nodes = this.peers;
    if(nodes.length === 0){
      await this.updatePeers();
      await this.checknode();
    } else {
      for(let i = 0; i<nodes.length; i++){
        let options = {
          uri: (nodes[i].ssl ? 'https://':'http://')+''+nodes[i].host+':'+nodes[i].port,
          url: api.status,
          method:'GET'
        };
        let success = await request(options);
        if(success){
          self.uri = (nodes[i].ssl ? 'https://':'http://')+''+nodes[i].host+':'+nodes[i].port;
          self.status = true;
          self.ip_node = nodes[i].host;
          self.port = nodes[i].port;
          self.ssl = nodes[i].ssl;
          this.init();
          break;
        }
      }
    }
  }catch (err){
    console.error(err);
    throw err;
  }
};

Node.prototype.emit = function (message, payload) {
  if(this.io){
    try {
      console.log('Data emit : ', payload);
      this.io.sockets.emit(message, payload);
    } catch (err) {
      console.error("Socket emit error:", err);
    }
  }
};

Node.prototype.resetPeers = async function () {
  try{
    console.info('Starting exchange peer ........')
    //await this.updatePeers();
    if((this.location + 1) >= this.peers.length ){
      this.location = (this.ip_node === this.peers[0].host) ? 1 : 0;
    } else {
      this.location ++;
    }
    let i = this.location;
    let peers = this.peers;
    console.log('Node select : ', peers[i].host);
    this.uri = (peers[i].ssl ? 'https://':'http://')+''+peers[i].host+':'+peers[i].port;
    let info = await request({
      uri:this.uri,
      url:api.configuration,
      method:'GET'
    });
    this.status = true;
    this.ip_node = peers[i].host;
    this.port = peers[i].port;
    this.info.height = peers[i].height;
    this.ssl = peers[i].ssl;
    this.info.username = (info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].username:null;
    this.info.version = peers[i].version;
    this.info.system = peers[i].os;
    this.info.latency = peers[i].latency;
    this.info.missBlocks = (info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].missedBlocks:0;
    this.info.producedBlocks = (info.data && info.data.delegates && info.data.delegates.length) > 0 ? info.data.delegates[0].producedBlocks:0;
    this.info.voteBalance = (info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].voteBalance:0;
  }catch (err){
    console.log("Reset peer error: ",err);
  }
};
Node.prototype.updatePeers = async function () {
  try{
    let options = {
      uri:this.uri,
      url:api.peers,
      method:'GET'
    };
    let data = await request(options);
    let peers = data.data;
    this.stats.peers = peers.length;
    if(peers.length > 0){
      this.peers = [{
        host:this.ip_node,
        port:this.port,
        ssl:this.ssl,
        height:this.info.height,
        version:this.info.version,
        os:this.info.system,
        latency:this.info.latency
      }];
      peers.map(e=>{
        let peer = {
          host:e.ip,
          port:4003,
          ssl:false,
          height:e.height,
          version:e.version,
          os:e.os,
          latency:e.latency
        };
        this.peers.push(peer);
      });
      console.info('Found '+peers.length+' from Know Network.');
    } else {
      console.info('Not found peer in Know NetWork....')
    }
  }catch (err){
    console.log("Update peers fail.");
    console.error(err);
  }
};
Node.prototype.updateBlockHeight = async function() {
  try{
    let options = {
      method:'GET',
      uri: this.uri,
      url:api.block,
      json:true
    };
    let data = await request(options);
    if(data.data && data.data.length > 0){
      let block = data.data[0];
      this.blockHeight = block.height;
      await this.validateLastBlock(null, block, '');
    } else {
      await this.resetPeers();
    }
  }catch (err){
    console.error(err);
    throw err;
  }
};

Node.prototype.validateLastBlock = async function (error, result, timeString) {
  try{
    if(result.height > this.stats.block.number){
      let timenow = Date.now();
      let time = (this.timeSendBlock !== 0) ? (timenow - this.timeSendBlock) : 5000;
      if(this.timeblock.length === 30){
        this.timeblock.shift();
        this.timeblock.push(time);
      }else {
        this.timeblock.push(time);
      }
      this.timeSendBlock = timenow;
      // Set array transactions
      if(this.transactions.length === 30){
        this.transactions.shift();
        this.transactions.push(result.transactions)
      }else {
        this.transactions.push(result.transactions);
      }
      console.info('Receive new block to know node : '+result.height+' . Quantity transactions : '+result.transactions+ ' /.To peers : '+this.ip_node);
      let block = {
        number: 0,
        hash: '',
        difficulty: 0,
        totalDifficulty: 0,
        transactions: [],
        uncles: [],
        forger: {
          username: '',
          address: '',
          publicKey:'',
          rate: '',
          productivity: 0,
          approval: 0
        }
      };
      block.number = this.info.height = result.height;
      block.hash = result.id;
      block.difficulty =  this.info.blockId = result.id;
      block.totalDifficulty = result.id;
      let tx = this.info.transactions = result.transactions;
      if(tx>0){
        for(let i = 0; i<tx; i++){
          block.transactions.push(Math.random().toString(36).substring(7));
        }
      }
      block.uncles = this.info.uncles = result.forged.reward;
      let infodelegate = await request({
        uri:this.uri,
        url:api.delegate +'/'+result.generator.username,
        json:true,
        method:'GET'
      });
      block.forger.rate = infodelegate.data.rank;
      block.forger.productivity = infodelegate.data.production.productivity;
      block.forger.approval = infodelegate.data.production.approval;
      block.forger.username = result.generator.username;
      block.forger.address = result.generator.address;
      block.forger.publicKey = result.generator.publicKey;
      this.stats.block = block;
      this.limit_peer = 0;
      //block.node = await this.getInfoNode();
      block.timeblock = this.timeblock;
      block.reportTransactions = this.transactions;
      this.sendBlockUpdate(block);
    } else {
      if(this.limit_peer < 5){
        this.limit_peer++;
        console.log('Limit peer : ', this.limit_peer);
      }else {
        this.limit_peer = 0;
        await this.resetPeers();
      }
      console.info("Not yet receive new block!");
    }
  }catch (err){
    console.log('Error: ',err);
  }
};
/**
 * Socket Emit
 * */
Node.prototype.sendBlockUpdate = async function (block) {
  this.timeSendBlock = Date.now();
  console.info("Sending stats to block ...");
  this.emit('block', await this.prepareBlock(block));
};

Node.prototype.whenConnect = async function () {
  this.emit('stats', await this.prepareStats());
  this.stats.block.timeblock = this.timeblock;
  this.stats.block.reportTransactions = this.transactions;
  this.stats.block.time = Date.now() - this.timeSendBlock;
  this.emit('block', await this.prepareBlock(this.stats.block));
};
Node.prototype.sendStatsUpdate = async function() {
  if(this.status){
    console.info("Sending stats to Knowstats ...");
    this.emit('stats', await this.prepareStats());
  }
}
Node.prototype.sendNodeStatus = async function () {
  if(this.status){
    console.log('Sending node information to KnowStats ..');
    this.emit('node', await this.prepareNode());
  }
}

/**
 * Prepare payload
 * */
Node.prototype.prepareStats = async function() {
  if(this.status){
    let countDelegate = {
      method:'GET',
      uri: this.uri,
      url:api.delegate,
      json:true
    };
    let delegate = await request(countDelegate);
    if(delegate && delegate.meta){
      this.stats.delegateCount = delegate.meta.count
    } else {
      this.stats.delegateCount = 0
    }
    return {
      id: Math.random().toString(36).substring(7),
      stats: {
        active: this.stats.active,
        syncing: this.stats.syncing,
        forging: this.stats.forging,
        peers: this.stats.peers,
        badPeers: this.stats.badPeers,
        delegateCount: this.stats.delegateCount,
        uptime: this.stats.uptime
      }
    };
  }
};
Node.prototype.prepareNode = async function () {
  return await this.getInfoNode();
};
Node.prototype.prepareBlock = function (block) {
  return {
    id:Math.random().toString(36).substring(7),
    block
  }
};
/**
 * Get Data
 * */
/**
 * version: `Know 2.0.0 | Know-Stats v1.0.1`,
   username: 'example',
   height:24460,
   latency:190,
   system: 'linux',
   blockId: "12719422239306930493",
   voteBalance: "5344660000000",
   producedBlocks: 3776,
   missBlocks: 22
 * */
Node.prototype.getInfoNode = async function () {
  try{
    await this.updatePeers();
    if(this.peers.length > 0 ){
      let promise = this.peers.map(async e =>{
        let block = await request({
          uri: (e.ssl ? 'https://':'http://')+''+e.host+':4003',
          url:api.getblock+e.height,
          method:'GET',
          json:true
        });
        let info = await request({
          uri: (e.ssl ? 'https://':'http://')+''+e.host+':4003',
          url:api.configuration,
          method:'GET',
          json:true
        });
        return {
          version: `Know ${e.version} | Know-Stats v1.0.1`,
          username: (info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].username:"Unknown",
          height:e.height,
          latency:e.latency,
          system: e.os,
          uncles:block.data[0].forged.reward,
          blockId: block.data[0].id,
          voteBalance:(info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].voteBalance:0,
          producedBlocks:(info.data && info.data.delegates && info.data.delegates.length) > 0 ? info.data.delegates[0].producedBlocks:0,
          missBlocks: (info.data && info.data.delegates && info.data.delegates.length > 0) ? info.data.delegates[0].missedBlocks:0,
          transactionBlock: block.data[0].transactions
        }
      });
      return await Promise.all(promise);
    }else {
      return []
    }
  }catch (err){
    return Promise.reject(err);
  }
};

Node.prototype.getStats = async function () {
  if(this.status){
    await this.updateBlockHeight();
  }
};

Node.prototype.getVersion = async function () {
  if(this.status){
    let options = {
      uri:this.uri,
      url:api.configuration,
      method:'GET',
      json:true
    };
    let data = await request(options);
    if(data) {
      this.versionInfo = data.data;
    }
  }
};

/**
 * Init
 * */

Node.prototype.setWatches = function () {
  this.blockInterval = setInterval(()=>{
    this.getStats();
  }, 1000);
  this.statsInterval = setInterval(()=>{
    this.sendNodeStatus();
    this.sendStatsUpdate();
  }, 5000)
};
Node.prototype.init = async function() {
  await this.getVersion();
  await this.setWatches();
};

Node.prototype.stop = function() {
  clearInterval(this.blockInterval);
  clearInterval(this.statsInterval);
}
module.exports = Node;