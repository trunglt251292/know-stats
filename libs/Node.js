import {request} from "./request";
import config from '../config';
const _ = require('lodash');
import globalConstants from '../globalConstants';

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
  peers:'/api/v2/peers'
};

function Node(io) {
  this.io = io;
  this.status = false;
  this.ip_node = '';
  this.port = '';
  this.uri = '';
  this.timeSendBlock = 0;
  this.ssl = false;
  this.blockHeight = 0;
  this.stats = {
    active: false,
    forging: false,
    peers: 0,
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
      }
    },
    syncing: false,
    uptime: 100 // deprecated
  };
  this.info = {};
  this.checknode();
}

Node.prototype.checknode = async function () {
  try{
    let self = this;
    let nodes = config.peers;
    for(let i = 0; i<nodes.length; i++){
      let options = {
        uri: (nodes[i].ssl ? 'https://':'http://')+''+nodes[i].host+':'+nodes[i].port+''+api.status,
        method:'GET',
        json:true
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
    if(!self.ip_node){
      console.info('Connected '+nodes.length+' node failed. Please setup again.');
      process.exit(1);
    }
  }catch (err){
    console.error(err);
    throw err;
  }
};

Node.prototype.emit = function (message, payload) {
  if(this.io){
    try {
      console.log('Data : ', payload);
      this.io.sockets.emit(message, payload);
    } catch (err) {
      console.error("Socket emit error:", err);
    }
  }
};

Node.prototype.updateBlockHeight = async function() {
  try{
    let options = {
      method:'GET',
      uri: this.uri+api.block,
      json:true
    };
    let data = await request(options);
    if(data.data.length > 0){
      let block = data.data[0];
      this.blockHeight = block.height;
      await this.validateLastBlock(null, block, '');
    }
  }catch (err){
    console.error(err);
    throw err;
  }
};

Node.prototype.validateLastBlock = async function (error, result, timeString) {
  if(result.height !== this.stats.block.number){
    console.info('Receive new block to know node : '+result.height+' . Quantity transactions : '+result.transactions);
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

    block.number = result.height;
    block.hash = result.id;
    block.difficulty = result.id;
    block.totalDifficulty = result.id;
    let tx = result.transactions;
    if(tx>0){
      block.transactions.push(Math.random().toString(36).substring(7));
    }
    block.uncles = result.forged.reward;

    block.forger.username = result.generator.username;
    block.forger.address = result.generator.address;
    block.forger.publicKey = result.generator.publicKey;
    this.stats.block = block;

    this.sendBlockUpdate(block);
  } else {
    console.info("Not yet receive new block!");
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
Node.prototype.sendStatsUpdate = async function() {
  if(this.status){
    console.info("Sending stats to Knowstats ...");
    this.emit('stats', await this.prepareStats());
  }
}


/**
 * Prepare payload
 * */
Node.prototype.prepareStats = async function() {
  if(this.status){
    let countDelegate = {
      method:'GET',
      uri: this.uri + api.delegate,
      json:true
    };
    let peers = {
      method:'GET',
      uri: this.uri + api.peers,
      json:true
    };
    let delegate = await request(countDelegate);
    if(delegate && delegate.meta){
      this.stats.delegateCount = delegate.meta.count
    } else {
      this.stats.delegateCount = 0
    }
    let peer = await request(peers);
    if(peer && peer.data.length > 0){
      this.stats.peers = peer.data.length;
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

Node.prototype.prepareBlock = function (block) {
  return {
    id:Math.random().toString(36).substring(7),
    block
  }
};
/**
 * Get Data
 * */
Node.prototype.getStats = function () {
  if(this.status){
    this.updateBlockHeight();
  }
};

Node.prototype.getVersion = async function () {
  if(this.status){
    let options = {
      uri:this.uri + api.configuration,
      method:'GET',
      json:true
    };
    let data = await request(options);
    if(data) {
      this.info = data.data;
    }
  }
};

/**
 * Init
 * */

Node.prototype.setWatches = function () {
  this.blockInterval = setInterval(()=>{
    this.getStats();
  }, 2000);
  this.statsInterval = setInterval(()=>{
    this.sendStatsUpdate();
  }, globalConstants.STATS_INTERVAL)
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