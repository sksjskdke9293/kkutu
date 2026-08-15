/**
 * Rule the words! KKuTu Online
 * Copyright (C) 2017 JJoriping(op@jjo.kr)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

$lib.Classic.roundReady = function(data){
	var i, len = $data.room.game.title.length;
	var $l;
	
	clearBoard();
	$data._roundTime = $data.room.time * 1000;
	$stage.game.display.html(getCharText(data.char, data.subChar));
	$stage.game.chain.show().html($data.chain = 0);
	if($data.room.opts.mission){
		$stage.game.items.show().css('opacity', 1).html($data.mission = data.mission);
	}
	if(MODE[$data.room.mode] == "KAP"){
		$(".jjoDisplayBar .graph-bar").css({ 'float': "right", 'text-align': "left" });
	}
	drawRound(data.round);
	playSound('round_start');
	recordEvent('roundReady', { data: data });
};
$lib.Classic.turnStart = function(data){
	$data.room.game.turn = data.turn;
	if(data.seq) $data.room.game.seq = data.seq;
	if(!($data._tid = $data.room.game.seq[data.turn])) return;
	if($data._tid.robot) $data._tid = $data._tid.id;
	data.id = $data._tid;
	
	$stage.game.display.html($data._char = getCharText(data.char, data.subChar, data.wordLength));
	$("#game-user-"+data.id).addClass("game-user-current");
	if(!$data._replay){
		$data._predictionSent = false;
		$stage.game.here.css('display', "block");
		if(data.id == $data.id){
			setTurnInputMode('word');
			$stage.game.hereText.val("").focus();
		}else{
			setTurnInputMode('prediction');
		}
	}
	$stage.game.items.html($data.mission = data.mission);
	
	ws.onmessage = _onMessage;
	clearInterval($data._tTime);
	clearTrespasses();
	$data._chars = [ data.char, data.subChar ];
	$data._speed = data.speed;
	$data._tTime = addInterval(turnGoing, TICK);
	$data.turnTime = data.turnTime;
	$data._turnTime = data.turnTime;
	$data._roundTime = data.roundTime;
	$data._turnSound = playSound("T"+data.speed);
	recordEvent('turnStart', {
		data: data
	});
};
function setTurnInputMode(mode){
	if(!$stage.game || !$stage.game.here) return;
	$stage.game.here.removeClass('mode-word mode-prediction mode-hint').addClass('mode-' + mode);
	if(mode == 'word'){
		$stage.game.inputLabel.text('내 차례');
		$stage.game.hereText.attr('placeholder', '이어지는 단어를 입력하세요');
		$stage.game.submit.text('제출');
		$stage.game.inputHelp.text('정답 단어를 입력하면 점수를 얻습니다.');
	}else if(mode == 'prediction'){
		$stage.game.inputLabel.text('다음 단어 예측');
		$stage.game.hereText.attr('placeholder', '상대가 낼 단어를 예측하세요');
		$stage.game.submit.text('예측');
		$stage.game.inputHelp.text('예측 성공 시 그 단어 점수의 20%를 받습니다.');
	}else{
		$data._predictionSent = true;
		$stage.game.inputLabel.text('힌트 주기');
		$stage.game.hereText.attr('placeholder', '다른 플레이어에게 힌트를 보내세요');
		$stage.game.submit.text('힌트');
		$stage.game.inputHelp.text('힌트는 채팅에 표시됩니다.');
	}
}
$lib.Classic.turnGoing = function(){
	if(!$data.room) clearInterval($data._tTime);
	$data._turnTime -= TICK;
	$data._roundTime -= TICK;
	
	$stage.game.turnBar
		.width($data._timePercent())
		.html(($data._turnTime*0.001).toFixed(1) + L['SECOND']);
	$stage.game.roundBar
		.width($data._roundTime/$data.room.time*0.1 + "%")
		.html(($data._roundTime*0.001).toFixed(1) + L['SECOND']);
	
	if(!$stage.game.roundBar.hasClass("round-extreme")) if($data._roundTime <= 5000) $stage.game.roundBar.addClass("round-extreme");
};
$lib.Classic.turnEnd = function(id, data){
	var $sc = $("<div>")
		.addClass("deltaScore")
		.html((data.score > 0) ? ("+" + (data.score - data.bonus)) : data.score);
	var $uc = $(".game-user-current");
	var hi;
	
	if($data._turnSound) $data._turnSound.stop();
	addScore(id, data.score);
	clearInterval($data._tTime);
	if(data.ok){
		checkFailCombo();
		clearTimeout($data._fail);
		$stage.game.here.hide();
		$stage.game.chain.html(++$data.chain);
		pushDisplay(data.value, data.mean, data.theme, data.wc);
	}else{
		checkFailCombo(id);
		$sc.addClass("lost");
		$(".game-user-current").addClass("game-user-bomb");
		$stage.game.here.hide();
		playSound('timeout');
	}
	if(data.hint){
		data.hint = data.hint._id;
		hi = data.hint.indexOf($data._chars[0]);
		if(hi == -1) hi = data.hint.indexOf($data._chars[1]);
		
		if(MODE[$data.room.mode] == "KAP") $stage.game.display.empty()
			.append($("<label>").css('color', "#AAAAAA").html(data.hint.slice(0, hi)))
			.append($("<label>").html(data.hint.slice(hi)));
		else $stage.game.display.empty()
			.append($("<label>").html(data.hint.slice(0, hi + 1)))
			.append($("<label>").css('color', "#AAAAAA").html(data.hint.slice(hi + 1)));
	}
	if(data.bonus){
		mobile ? $sc.html("+" + (b.score - b.bonus) + "+" + b.bonus) : addTimeout(function(){
			var $bc = $("<div>")
				.addClass("deltaScore bonus")
				.html("+" + data.bonus);
			
			drawObtainedScore($uc, $bc);
		}, 500);
	}
	drawObtainedScore($uc, $sc).removeClass("game-user-current");
	updateScore(id, getScore(id));
};
