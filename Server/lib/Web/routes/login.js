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

const MainDB	 = require("../db");
const JLog	 = require("../../sub/jjlog");
// const Ajae	 = require("../../sub/ajaejs").checkAjae;
const passport = require('passport');
const glob = require('glob-promise');
const GLOBAL	 = require("../../sub/global.json");
const config = require('../../sub/auth.json');
const path = require('path')
const crypto = require('crypto');

const ADMIN_IDS = ['admin1', 'admin2'];
const ADMIN_INITIAL_PASSWORD = 'admin';

function passwordHash(password, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const rounds = 120000;
    const hash = crypto.pbkdf2Sync(password, salt, rounds, 32, 'sha256').toString('hex');
    return `pbkdf2$${rounds}$${salt}$${hash}`;
}

function passwordMatches(password, stored) {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const actual = Buffer.from(parts[3], 'hex');
    const expected = crypto.pbkdf2Sync(password, parts[2], Number(parts[1]), actual.length, 'sha256');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function validId(id) {
    return /^[A-Za-z0-9_]{3,20}$/.test(id);
}

function profileFor(req, id) {
    return {
        id: id,
        sid: req.session.id,
        title: id,
        name: id,
        birth: [4, 16, 0],
        _age: { min: 20 }
    };
}

function finishLogin(req, profile, callback) {
    const now = Date.now();
    req.session.profile = profile;
    req.session.admin = ADMIN_IDS.includes(profile.id);
    req.session.guestAccepted = false;
    MainDB.session.upsert([ '_id', req.session.id ]).set({
        profile: profile,
        createdAt: now
    }).on(function () {
        MainDB.users.update([ '_id', profile.id ]).set([ 'lastLogin', now ]).on(function () {
            callback();
        });
    });
}

function process(req, accessToken, MainDB, $p, done) {
    $p.token = accessToken;
    $p.sid = req.session.id;

    let now = Date.now();
    $p.sid = req.session.id;
    req.session.admin = GLOBAL.ADMIN.includes($p.id);
    req.session.authType = $p.authType;
    MainDB.session.upsert([ '_id', req.session.id ]).set({
        'profile': $p,
        'createdAt': now
    }).on();
    MainDB.users.findOne([ '_id', $p.id ]).on(($body) => {
        req.session.profile = $p;
        MainDB.users.update([ '_id', $p.id ]).set([ 'lastLogin', now ]).on();
    });

    done(null, $p);
}

exports.run = (Server, page) => {
    //passport configure
    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((obj, done) => {
        done(null, obj);
    });

    const strategyList = {};
    
	for (let i in config) {
		try {
			let auth = require(path.resolve(__dirname, '..', 'auth', 'auth_' + i + '.js'))
			Server.get('/login/' + auth.config.vendor, passport.authenticate(auth.config.vendor))
			Server.get('/login/' + auth.config.vendor + '/callback', passport.authenticate(auth.config.vendor, {
				successRedirect: '/',
				failureRedirect: '/loginfail'
			}))
			passport.use(new auth.config.strategy(auth.strategyConfig, auth.strategy(process, MainDB /*, Ajae */)));
			strategyList[auth.config.vendor] = {
				vendor: auth.config.vendor,
				displayName: auth.config.displayName,
				color: auth.config.color,
				fontColor: auth.config.fontColor
			};

			JLog.info(`OAuth Strategy ${i} loaded successfully.`)
		} catch (error) {
			JLog.error(`OAuth Strategy ${i} is not loaded`)
			JLog.error(error.message)
		}
	}
	
	Server.get("/login", (req, res) => {
		if (req.session.profile || req.session.guestAccepted) return res.redirect('/?server=0#');
		page(req, res, "login", {
            '_id': req.session.id,
            'error': req.query.error,
            'notice': req.query.notice,
            'loginList': strategyList
        });
	});

    Server.post('/auth/register', (req, res) => {
        const id = String(req.body.id || '').trim();
        const password = String(req.body.password || '');
        const passwordCheck = String(req.body.passwordCheck || '');
        if (!validId(id)) return res.redirect('/login?error=' + encodeURIComponent('아이디는 영문, 숫자, 밑줄 3~20자로 입력하세요.'));
        if (ADMIN_IDS.includes(id)) return res.redirect('/login?error=' + encodeURIComponent('운영자 아이디는 회원가입할 수 없습니다.'));
        if (password.length < 4 || password.length > 64) return res.redirect('/login?error=' + encodeURIComponent('비밀번호는 4~64자로 입력하세요.'));
        if (password !== passwordCheck) return res.redirect('/login?error=' + encodeURIComponent('비밀번호 확인이 일치하지 않습니다.'));
        MainDB.users.findOne([ '_id', id ]).limit([ 'password', true ]).on(function (user) {
            if (user) return res.redirect('/login?error=' + encodeURIComponent('이미 사용 중인 아이디입니다.'));
            MainDB.users.upsert([ '_id', id ]).set({
                password: passwordHash(password),
                lastLogin: Date.now()
            }).on(function () {
                finishLogin(req, profileFor(req, id), function () {
                    res.redirect('/?server=0#');
                });
            });
        });
    });

    Server.post('/auth/login', (req, res) => {
        const id = String(req.body.id || '').trim();
        const password = String(req.body.password || '');
        if (!validId(id) || !password) return res.redirect('/login?error=' + encodeURIComponent('아이디와 비밀번호를 입력하세요.'));
        MainDB.users.findOne([ '_id', id ]).limit([ 'password', true ]).on(function (user) {
            const isInitialAdmin = ADMIN_IDS.includes(id) && password === ADMIN_INITIAL_PASSWORD && (!user || !user.password);
            if (!isInitialAdmin && (!user || !passwordMatches(password, user.password))) {
                return res.redirect('/login?error=' + encodeURIComponent('아이디 또는 비밀번호가 올바르지 않습니다.'));
            }
            const login = function () {
                finishLogin(req, profileFor(req, id), function () {
                    res.redirect('/?server=0#');
                });
            };
            if (isInitialAdmin) {
                MainDB.users.upsert([ '_id', id ]).set({ password: passwordHash(password) }).on(login);
            } else login();
        });
    });

    Server.get('/guest', (req, res) => {
        delete req.session.profile;
        req.session.admin = false;
        req.session.guestAccepted = true;
        MainDB.session.remove([ '_id', req.session.id ]).on(function () {
            res.redirect('/?server=0#');
        });
    });

	Server.get("/logout", (req, res) => {
		MainDB.session.remove([ '_id', req.session.id ]).on(function () {
            req.session.destroy(function () {
                res.redirect('/login');
            });
        });
	});

	Server.get("/loginfail", (req, res) => {
		page(req, res, "loginfail");
	});
}
