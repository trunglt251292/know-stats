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
    let nodes = this.peers;
    if(nodes.length === 0){
      await this.updatePeers();
      await this.checknode();
    } else {
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

Node.prototype.resetPeers = async function () {
  try{
    console.info('Starting exchange peer ........')
    if((this.location + 1) >= this.stats.peers ){
      this.location = 0;
    } else {
      let i = this.location + 1;
      this.location ++;
      let peers = this.peers;
      this.uri = (peers[i].ssl ? 'https://':'http://')+''+peers[i].host+':'+peers[i].port;
      this.status = true;
      this.ip_node = peers[i].host;
      this.port = peers[i].port;
      this.ssl = peers[i].ssl;
    }
  }catch (err){
    console.log("Reset peer error: ",err);
  }
};
Node.prototype.updatePeers = async function () {
  try{
    let options = {
      uri:this.uri+api.peers,
      method:'GET',
      json:true
    };
    let data = await request(options);
    let peers = data.data;
    if(peers.length > 0){
      peers.map(e=>{
        let peer = {
          host:e.ip,
          port:4003,
          ssl:false
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
      uri: this.uri+api.block,
      json:true
    };
    let data = await request(options);
    if(data && data.data.length > 0){
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

    block.number = result.height;
    block.hash = result.id;
    block.difficulty = result.id;
    block.totalDifficulty = result.id;
    let tx = result.transactions;
    if(tx>0){
      for(let i = 0; i<tx; i++){
        block.transactions.push(Math.random().toString(36).substring(7));
      }
    }
    block.uncles = result.forged.reward;

    block.forger.username = result.generator.username;
    block.forger.address = result.generator.address;
    block.forger.publicKey = result.generator.publicKey;
    this.stats.block = block;
    this.limit_peer = 0;
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
  this.emit('block', await this.prepareBlock(this.stats.block));
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
    this.peers = [];
    if(peer.data.length > 0){
      peer.data.map(e=>{
        let p = {
          host:e.ip,
          port:4003,
          ssl:false
        };
        this.peers.push(p);
      });
      console.info('Found '+peer.data.length+' from Know Network.');
      console.info('List peers : ',this.peers);
    } else {
      console.info('Not found peer in Know NetWork....')
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