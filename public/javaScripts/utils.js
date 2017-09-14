//*******
//Divers:

function counter(name, val=-1){
//Usage: counter(counter_name, [init_value (disabled with 0)]); enabled, ++ on every call...
	if(typeof this.count==='undefined') this.count=[];
	if(typeof this.count[name]==='undefined') this.count[name]=1;
	return(val<0 ? this.count[name]++ : this.count[name]=val)
}

var powerOffIntervalId=0;
function shutdown(d=0){
	clearInterval(powerOffIntervalId);
	if(d>=0)
		powerOffIntervalId=setInterval(function(){
			if(!isPowerOff()) clickPower();
		}, d?d:900000);
}

function speedThreshold(v=-1){
	if(v>=0){ shutdown(v?-1:0);
		speedo.setThreshold(this.speedThresholdValue=(!v?0.01:( v<speedo.getMaxValue()?v:speedo.getMaxValue() )));
	} return Math.round(this.speedThresholdValue*10)/10;
}

function chronoReset(){chrono.reset(); this.chronoOverflow=0; this.chronoOverflowIncr=false;}
function getChronoMeasuredTime(){
	var s=chrono.getMeasuredTime(), i=s.indexOf(":");
	var v=parseInt(s.substr(0, i++))*60; v +=parseInt(s.substr(i).substr(0, s.indexOf(":")));
	if (v)	this.chronoOverflowIncr=true;
	else{	if(this.chronoOverflowIncr){
			this.chronoOverflow +=1800;
			this.chronoOverflowIncr=false;
	}	}
	return v+this.chronoOverflow;
}

function getNbSeconds(){return((clock.getHour()*60+clock.getMinute())*60+clock.getSecond());}

// Usage: Delays in ms... Stopped on 'pict1' with d2==0...
function clignote(el, pict1, d1, pict2="", d2=0){
	if(!d2){counter(el.id, 0);
		setTimeout(function(e=el, s=pict1, t=d1){e.src=s;}, d1);
	}else{	counter(el.id);
		el.src=pict1; clignote2(el, pict1, d1, pict2, d2);
}} function clignote1(el, pict1, d1, pict2, d2){ if(counter(el.id)){
	el.src=pict1; setTimeout(function(e=el, p1=pict1, t1=d1, p2=pict2, t2=d2){clignote2(e, p1, t1, p2, t2);}, d1);
	}else	counter(el.id, 0);
} function clignote2(el, pict1, d1, pict2, d2){
	el.src=pict2; setTimeout(function(e=el, p1=pict1, t1=d1, p2=pict2, t2=d2){clignote1(e, p1, t1, p2, t2);}, d2);
}

function flashDisplay(el, d=8000){
	clearInterval(this.flashDisplayIntervalId);
	if(el.style.display==='none'){
		if(el===document.getElementById('comboStopMode')){
			if(!document.getElementById('comboTime').style.display==='none')
				return document.getElementById('comboTime').style.display='none';
			if(!document.getElementById('comboDistance').style.display==='none')
				return document.getElementById('comboDistance').style.display='none';
		} this.flashDisplayIntervalId=setInterval(function(e=el){e.style.display='none';}, d);
		return el.style.display='block';
	} return el.style.display='none';
}

function doMessage(s, width='200px', height='15px'){
	var el=document.getElementById('message');
	el.style.width=width; el.style.height=height; el.innerHTML=s;
	flashDisplay(el, 1800);
}

function isState(id, value, blink, poff='-off.png'){
	var el=document.getElementById(id);
	var pict="./public/images/"+el.id;

	if(el.value !== value)
		return false

	if(blink){
		clignote(el, pict+'.png', 100, pict+'-on.png', 100);
		setTimeout(function(e=el, s=pict+poff) {clignote(e, s, 100);}, 800);
	}return true;
}
function isPowerOff(blink=false){return(isState("power", "Power On", blink));}
function isSpeedUp (blink=false){return(isState("up", "Up", blink, '.png'));}
function isPauseOff(blink=false){return(isState("pause", "Pause On", blink));}
function isStopOff (blink=false){return(isState("stop", "Stop", blink, '.png'));}

