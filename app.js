import express from 'express';
import Node from './libs/Node';
const http = require('http');
const port = 8000;
const host = '0.0.0.0';

const SocketIO = require('socket.io');
const app = express();
const server = http.createServer(app);
server.listen(port, ()=>{
  console.log('Server dang hoat dong nhe!!!! port : ', port);
});
// const server = require('http').createServer(app);
const io = new SocketIO(server);
// const server = http.createServer();
io.on('connection',(socket)=>{
  console.log('Co nguoi ket noi !!');
  socket.on('disconnect',()=>{
    console.log('Co nguoi thoat!'+socket.id);
  })
});
const node = new Node(io);
process.on('message', function(msg) {
  if (msg == 'shutdown') {
    console.log('Stop know stats server!');
    node.stop();
  }
});
