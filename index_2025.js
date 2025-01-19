#!/usr/bin/env nodejs
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const { Gpio } = require('pigpio');
const i2c = require('i2c-bus');
const exec = require('child_process').exec;

const port = process.env.NODE_PORT || 8080;
const hostname = process.env.NODE_HOSTNAME || '0.0.0.0';
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
console.log(Date() + ': treadmill connected on ' + hostname + ":" + port + '...');

////////////////////////////////////////////////////////////////////////////////
// Interface displaying:
app.get('/', (req, res) => {
	console.log(Date() + ': connected to ' + req.url + '.');
	res.sendFile(req.url, {root: require('path').join(__dirname, '/public')});
});

// Push the training programs to the client:
app.get('/public/assets/programs.json', (req, res) => {
	fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), (err, data) => {
		res.writeHead(200, {'Content-Type': 'text/html'});
		if(!err) res.write(data);
		res.end();
	});
});

app.get('/public/*', (req, res) => {
	//console.log(Date() + ': connected to ' + req.url + '.');
	res.sendFile(req.url, {root: __dirname});
});

app.use((req, res, next) => {
	res.setHeader('Content-Type', 'text/plain');
	res.status(404).send('Page not found!');
});
////////////////////////////////////////////////////////////////////////////////
// GPIO and I2C Setup:
var DUMMY = true;						// DUMMY=true for no motor connected...
								// SET DUMMY TO FALSE AT YOUR OWN RISK!!!
								// This program is distributed in the hope that
								// it will be useful, but WITHOUT ANY WARRANTY.
const powerPin		= new Gpio(23, { mode: Gpio.OUTPUT });	// pin 33 (GPIO13)-(relay~1mn)
const motorPin		= new Gpio( 1, { mode: Gpio.PWM });	// pin 12 (GPIO18)
const enableCounterPin	= new Gpio( 0, { mode: Gpio.OUTPUT });	// pin 11 (GPIO17)
const resetCounterPin	= new Gpio( 2, { mode: Gpio.OUTPUT });	// pin 13 (GPIO27)

const powerOffDelay	= 600000;
const speedMax		= 25;					// km/h
//const deltaSpeed	= 5;					// km/h per second...
const deltaSpeed	= 50;					// Pendant la durée des tests !!!!!!!!!!!!!!!!!!
//const formFactor	= 36*18;				// pulses per meter...
const formFactor	= 14;					// pulses per meter...
								// 1km/h->180p/s, 25km/h->4500p/s
const speedPeriod	= 500;					// ms
const deltaMax		= Math.round(deltaSpeed*speedPeriod/100)/10;
let currentSpeed	= 0;
let init		= false;
let setSpeedIntervalId	= 0;
let powerOffIntervalId	= 0;
let counterFD		= 0;

// Initialize I2C bus
const i2cBus = !DUMMY ?i2c.openSync(1) :null;			// Ensure this matches your I2C bus number
const mcpAddress = !DUMMY ?0x20 :null;				// I2C address for MCP23017

// Initialize MCP23017
function initMCP() {
	if (!DUMMY) {
		 i2cBus.writeByteSync(mcpAddress, 0x00, 0x00); // IODIRA: set all pins to output
		 i2cBus.writeByteSync(mcpAddress, 0x01, 0x00); // IODIRB: set all pins to output
		 // Additional MCP23017 setup can go here if needed
	}
}

// Gestion de l'extinction automatique sur délai(powerOffDelay)
let powerOn = true;
setInterval(() => {
	resetShutdown();
	if ((init = !DUMMY ?initMCP() :true)){
		//console.log(Date() + ': Hardware ' + (DUMMY ?'(dummy)' :'') + ' connected...');
		clearInterval(powerOn); powerOn = true;
	}
}, 5000);

function getSpeed(period=10){
	if (powerOn)	powerPin.digitalWrite(1);
	setTimeout(() => { powerPin.digitalWrite(0);}, 1<<period>>1);

	enableCounterPin.digitalWrite(0);
	//let count= /*0x0fff & */wpi.wiringPiI2CReadReg16(counterFD, 0x12);	// pulses/meters/(1<<period)ms
	let count = !DUMMY ?i2cBus.readWordSync(mcpAddress, 0x12) :0;		// Read from MCP23017 register
	resetCounterPin.digitalWrite(1);
	enableCounterPin.digitalWrite(1);
	resetCounterPin.digitalWrite(0);

	// Convert count to speed
	//				->m		/s	    /h	 -xx.y-	== km/h
	//currentSpeed = Math.round(count/formFactor /(1<<period) *3600 *10)/10;
	currentSpeed = ((count*36000/formFactor+500)>>period)/10;

	// Ajust period of the speed measurement to prevent overflow of the counter (12bits):
	if(count>(1<<15)/10 && period>8)	// more than 80% of (1<<12) -> period/2
		period--;
	else if(period<10 && count<(1<<13)/10)	// less than 20% of (1<<12) -> period*2
		period++;

	setTimeout(function(){getSpeed(period);}, 1<<period);
}

function setSpeed(v, sock=0){
	clearInterval(setSpeedIntervalId); //v=(v<0?0:v); v=(v>speedMax?speedMax:v);
	v = Math.max(0, Math.min(v, speedMax)); // Clamp speed
	setSpeedIntervalId=setInterval(() => {
		if (currentSpeed===v){
			if (setSpeedIntervalId._idleTimeout != -1){
				clearInterval(setSpeedIntervalId);
				if (!v && !DUMMY) motorPin.pwmWrite(0);
			}
		}else{	if (/*v && */init){
				let delta = v-currentSpeed;
				delta = Math.sign(delta) * Math.min(Math.abs(delta), deltaMax);
				currentSpeed += delta;

				if (!DUMMY) {
					motorPin.pwmWrite(Math.round(currentSpeed * 1024 / speedMax));
//console.log(Math.round(speed*1024/speedMax));
				}
			}else{	if (!DUMMY)
					motorPin.pwmWrite(0);
				else	currentSpeed=0;
		}	}
		if (sock) sock.emit('speed', currentSpeed);
//console.log('CurrentSpeed: ' + currentSpeed);
	}, speedPeriod);
}

function resetShutdown(delay = 0){
	clearInterval(powerOffIntervalId);
	if (delay >= 0) {
		powerOffIntervalId = setInterval(() => {
			console.log(Date() + ': bye!');
			if (!DUMMY) {
				powerOn = false;	// now, Power off - 1 mn ...
				exec("/sbin/shutdown -h now", () => {console.log('Shutdown -h now...');});
			}else	console.log('DUMMY mode: hardware reconnect...');
		}, delay ?delay :powerOffDelay);
}	}
////////////////////////////////////////////////////////////////////////////////
// Client/server communication :
let clientsId = [''];

/*let speedRefreshId;
function sendSpeed(sock, delay=0){
	if(delay)
		speedRefreshId=setInterval(function(){sock.emit('speed', currentSpeed);}, delay);
	else{	setSpeed(0); clearInterval(speedRefreshId);
}	}*/

io.sockets.on('connection', (socket) => {
	let id;
	clientsId.push(socket.id);

	// On PowerOn:
	socket.on('powerOn', (data) => {	// Un seul a la fois:
		if (clientsId[0] == '') {	// libre...
			clientsId.splice(clientsId.indexOf(socket.id), 1);
			clientsId[0] = socket.id;
			setSpeed(0, socket); /*sendSpeed(socket, speedPeriod);*/
			id = setInterval(() => {
				if (init)
					clearInterval(id);
				else	socket.emit('initFault');
			}, 5000);
			resetShutdown(-1);
		}else 	socket.emit('denied');	// deja occupe!
	});

	// On PowerOff:
	socket.on('powerOff', () => {
		if (clientsId[0] == socket.id){
			setSpeed(0); clientsId.unshift('');
			clearInterval(id);
			resetShutdown(30000);
		}
	});

	// Speed management:
	socket.on('speed', (data) => {
		if (clientsId[0] == socket.id)
			setSpeed(data, socket);
	});

	// On Pause:
	socket.on('pause', (data) => {
		if (clientsId[0] == socket.id)
			setSpeed(0, socket);
	});

	// On save program:
	socket.on('savProg', (data) => {
		if (clientsId[0] == socket.id) {
			fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), (err, d) =>{
				if (!err || err.code==='ENOENT')
					try {
						var o = [], b = JSON.parse(data);
						if (!err) o = JSON.parse(d);
						o[parseInt(Object.keys(b))] = b[Object.keys(b)];
						writePrograms(o);
					} catch(er) {throw er;}
				else throw(err);
			});
		}
	});

	// On delete program:
	socket.on('delProg', (data) => {
		if (clientsId[0] == socket.id) {
			fs.readFile(require('path').join(__dirname, '/public/assets/programs.json'), (err, d) => {
				if (err) throw err;
				try{	var o = JSON.parse(d);
					o.splice(parseInt(data), 1);
					writePrograms(o);
				} catch(er) {throw er;}
			});
		}
	});

	// On disconnect:
	socket.on('disconnect', () => {
		if (clientsId[0] == socket.id) {
			setSpeed(0);
			clientsId.unshift('');
			resetShutdown();
		} clientsId.splice(clientsId.indexOf(socket.id), 1);
});	});

function writePrograms(o){
	if(o) fs.writeFile(require('path').join(__dirname, '/public/assets/programs.json'), JSON.stringify(o), (err) => {
		if(err) throw err;
	});
}
////////////////////////////////////////////////////////////////////////////////
// Start the server
server.listen(port, hostname, () => {
	console.log(`Server running at http://${hostname}:${port}/`);
});

// Clean up GPIO and I2C on exit
process.on('SIGINT', () => {
	powerPin.digitalWrite(0);
	motorPin.pwmWrite(0);
	enableCounterPin.digitalWrite(0);
	resetCounterPin.digitalWrite(0);
	if (!DUMMY) {
		i2cBus.closeSync(); // Close I2C bus only if not in DUMMY mode
	}
	console.log('GPIO cleaned up. Exiting...');
	process.exit();
});
////////////////////////////////////////////////////////////////////////////////
