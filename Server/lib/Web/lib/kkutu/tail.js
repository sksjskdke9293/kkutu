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

window.KKuTuLocalDev = {
	autoWord: false,
	run: function(action, amount){
		var me = $data.users && $data.users[$data.id];
		amount = Number(amount) || 0;
		if(action == 'robot'){
			send('invite', { target: 'AI' });
			return true;
		}
		if(action == 'fakeRobot'){
			send('dev', { action: 'fakeRobot' });
			return true;
		}
		if(action == 'readyStart'){
			if(!$data.room) return false;
			if($data.room.master == $data.id) $stage.menu.start.trigger('click');
			else $stage.menu.ready.trigger('click');
			return true;
		}
		if(action == 'autoWord'){
			this.autoWord = !this.autoWord;
			send('dev', { action: action, enabled: this.autoWord });
			return this.autoWord ? 'ON' : 'OFF';
		}
		send('dev', { action: action, amount: amount });
		if(action == 'money' && me){
			me.money += amount;
			updateMe();
		}else if(action == 'xp' && me){
			me.data.score += amount;
			updateMe();
		}else if(action == 'score' && $data.room && me){
			addScore($data.id, amount);
			updateScore($data.id, getScore($data.id));
		}
		return true;
	},
	ready: function(){ return !!($data && $data.id && $data.admin); }
};

delete window.WebSocket;
delete window.setInterval;
