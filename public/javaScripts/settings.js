function clearStopMode(){
	clearInterval(this.flashDisplayIntervalId);
	clearInterval(this.refreshDownCounterIntervalId);
	document.getElementById("canvasLcdChrono").style.display='none';
	document.getElementById('comboTime').style.display='none';
	document.getElementById('comboTime').options.selectedIndex=0;
	document.getElementById('comboDistance').style.display='none';
	document.getElementById('comboDistance').options.selectedIndex=0;
	document.getElementById('comboStopMode').style.display='none';
	document.getElementById('comboStopMode').options.selectedIndex=0;
}

function openComboStopMode(){
	if(!isPowerOff(true)){
		if(document.getElementById("canvasLcdChrono").style.display!=='none')
			isStopOff(true);
		else{	clearStopMode(); 
			flashDisplay(document.getElementById('comboStopMode'));
}	}	}

function setStopMode(el){
	clearInterval(this.flashDisplayIntervalId); el.style.display='none';
	switch(el.options.selectedIndex){
	    case 1: flashDisplay(document.getElementById('comboTime'));	break;
	    case 2: flashDisplay(document.getElementById('comboDistance'));	break;
	    case 3: setProgram(); break;
	} el.options.selectedIndex = 0;
}

function closeCombos(el){
	el.style.display='none';
	clearInterval(this.flashDisplayIntervalId);
	if(el.value!==0)
		downCounter(el.value, (el.id==='comboTime' ? 's': 'm'));
}

function residual(v, s){
	const WIDTH=32;
	switch(s){
	    case 'm':
		v = Math.round(v - speedo.getOdoValue());
		s = 'Distance restante: ' + v + s;
		break;
	    case 's':
		v-= getChronoMeasuredTime();
		s = 'Temps restant: ' + (v<60?'':Math.trunc(v/60)+'mn:')+('0'+(v%60)).slice(-2) + s;
		break;
	    default: const DELAY=(v.length>1?300:150);
		var vv=v, t=getChronoMeasuredTime(), i=Math.trunc(t/DELAY), v=vv.length*DELAY-t;
		var r=1; while(vv[i+r] && vv[i+r]===vv[i]) r++; s=vv[i+r]||0; r=v-(vv.length-i-r)*DELAY;
		if(!(v%DELAY)){
			speedThreshold(vv[i]+0.5); if(isPauseOff()) clickSpeed(document.getElementById('down'));
		}s = (v<60?'':Math.trunc(v/60)+'mn:')+('0'+(v%60)).slice(-2)+'s (dans '+(r<60?r+'s: ':Math.trunc(r/60)+'mn: ')+(s?s+'km/h)':'pause)');
	} s += ' '.repeat((WIDTH-s.length)/2);
	lcd.setValue(s);
	return v;
}

function downCounter(duree, type=0){
	clearInterval(this.refreshDownCounterIntervalId); chronoReset();
	document.getElementById('canvasLcdChrono').style.display='none';
	this.flashDisplayIntervalId=setTimeout(function(){document.getElementById("canvasLcdChrono").style.display='block';}, 1000);
	this.refreshDownCounterIntervalId=setInterval(function(){
		if(residual(duree, type)<=0){
			if(speedThreshold()<10){
				clearInterval(this.refreshDownCounterIntervalId);
				clearStopMode(); clickPause();
			}else	downCounter([5]);	// 5km/h during 5mn...
		}
	}, 1000);
}

function setProgram(){ openSpeedBarGraph(); }

function openSpeedBarGraph(){
	initSpeedBarGraph();
	document.getElementById('interface').style.display='none';
	document.getElementById('speedBarGraph').style.display='block';
}

function closeSpeedBarGraph(){
	document.getElementById('speedBarGraph').style.display='none';
	document.getElementById('interface').style.display='block';

	var v = [];
	var el=document.getElementById('speedGraph').firstChild.firstChild;
	while(el){
		v.push(parseInt(el.getElementsByTagName('td')[0].firstChild.innerHTML));
		el = el.nextSibling;
	} for(var i=v.length; i && !v[--i];) v.pop();
	if(isPauseOff()) clickPause(); downCounter(v);
}

function setBarValue(el, incr){
	el = (incr>0 ? el : el.parentElement.getElementsByTagName('td')[0]);
	var v=el.firstChild.innerHTML; if(v=='') v='0'; v=parseInt(v);
	switch(v){
	    case  0: if(incr<0)v=1;	break;
	    case 25: if(incr>0)	break;
	    default: v+=incr;
	} el.firstChild.innerHTML = (v ? v : '');
	el.style.height = (v * 12) + 'px';
}

function initSpeedBarGraph(v=[5,8,12,15,20,15,12,10,10,10,8,5]){
	var tbody=document.createElement('tbody');
	for (var i=0; i<12; i++){
		var tr=document.createElement('tr');
		var th=document.createElement('th');
		var td=document.createElement('td');
		var p=document.createElement('p');
		p.innerHTML = (v[i] ? v[i] : ''); td.appendChild(p);

		td.className = 'speed bar'; td.style.height = (v[i] * 12) + 'px';
		td.onclick = function(){setBarValue(this,1);};
		th.scope = 'row'; th.innerHTML = ((i+1)*5)+'mn';
		th.onclick = function(){setBarValue(this,-1);};

		tr.appendChild(th); tr.appendChild(td);
		tr.id = 'q'+i; tbody.appendChild(tr);
	} document.getElementById('speedGraph').appendChild(tbody);
}
