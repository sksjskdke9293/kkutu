(function () {
  'use strict';

  function showStatus(text, error) {
    $('#LocalDevStatus').text(text).toggleClass('error', !!error);
  }

  function api() {
    var value = window.KKuTuLocalDev;
    if (!value || !value.ready()) {
      showStatus('운영자 계정에서만 사용할 수 있습니다.', true);
      return null;
    }
    return value;
  }

  function actionButton(label, action, amount) {
    return $('<button>').text(label).on('click', function () {
      var dev = api();
      if (!dev) return;
      if (!dev.run(action, amount || 0)) return showStatus('현재 상태에서는 사용할 수 없습니다.', true);
      showStatus(label + ' 적용 완료');
    });
  }

  function mount() {
    if ($('#LocalDevPanel').length) return;
    var panel = $('<aside id="LocalDevPanel">')
      .append($('<div class="dev-head">').append('<b>운영자 패널</b><span>ADMIN</span>'))
      .append($('<div class="dev-grid">')
        .append($('<button id="DevAutoWord">').text('자동 단어: OFF').on('click', function () {
          var dev = api();
          if (!dev) return;
          var state = dev.run('autoWord');
          $(this).text('자동 단어: ' + state).toggleClass('active', state === 'ON');
          showStatus('자동 단어 ' + state);
        }))
        .append(actionButton('+10,000 핑', 'money', 10000))
        .append(actionButton('+100,000 경험치', 'xp', 100000))
        .append(actionButton('+1,000 게임 점수', 'score', 1000))
        .append(actionButton('현재 턴 넘기기', 'skip'))
        .append(actionButton('AI 로봇 추가', 'robot'))
        .append(actionButton('핵 끄투봇 추가', 'fakeRobot'))
        .append(actionButton('준비 / 시작', 'readyStart')))
      .append($('<div id="LocalDevStatus">').text('기능을 선택하세요.'))
      .append($('<small>').text('` 또는 ~ 키로 열기 · admin1/admin2 전용'));
    var toggle = $('<button id="LocalDevToggle">').text('</>').attr('title', '운영자 패널 열기').hide()
      .on('click', function () { if (api()) panel.toggleClass('open'); });
    $('body').append(toggle, panel);

    function revealForAdmin() {
      if (window.KKuTuLocalDev && window.KKuTuLocalDev.ready()) toggle.show();
      else window.setTimeout(revealForAdmin, 500);
    }
    revealForAdmin();

    window.addEventListener('keydown', function (event) {
      if (event.code !== 'Backquote' && event.key !== '`' && event.key !== '~') return;
      if (!api()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      panel.toggleClass('open');
    }, true);
  }

  $(mount);
})();
