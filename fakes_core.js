// ==UserScript==
// @name         FAKES MDS
// @include      https://pt*.tribalwars.com.pt/game.php?*screen=place*
// @author       MDS (baseado no trabalho original de oSetas)
// @description  baseado no trabalho original de oSetas
// ==/UserScript==


/* =============== CONFIGS =============== */
console.log("MDS Scripts © 2026");
var tempo        = 500;
var tempoSwitch  = 1200;

/* =============== COOKIE NAMES =============== */
var attackCookieName            = 'attackSent_hybrid';
var enabledCookieName           = 'scriptEnabled';
var fakePctCookieName           = 'fakePct';
var reach2pctCookieName         = 'reach2pct';
var candidateCookieName         = 'fakeCandidates';
var maxUnitsCookieName          = 'maxUnits';
var attacksPerVillageCookieName = 'attacksPerVillage';
var fillModeCookieName          = 'fillMode'; // 'standard' ou 'spy_focus'
var catapultTargetCookieName    = 'catapultTarget'; // edifício alvo das catapultas

/* =============== UNIT DEFINITIONS =============== */
var unitGroups = {
    'Infantaria':  ['spear', 'sword', 'axe'],
    'Cavalaria':   ['spy', 'light', 'heavy'],
    'Máq. guerra': ['ram', 'catapult']
};

var unitImgs = {
    spear:    'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_spear.png',
    sword:    'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_sword.png',
    axe:      'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_axe.png',
    spy:      'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_spy.png',
    light:    'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_light.png',
    heavy:    'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_heavy.png',
    ram:      'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_ram.png',
    catapult: 'https://dspt.innogamescdn.com/asset/2fe6656b/graphic/unit/unit_catapult.png'
};

var unitSpeeds = { scout:9, light:10, heavy:11, axe:18, spear:18, sword:22, ram:30, catapult:30 };

var fillOrder = ['ram', 'catapult', 'spy', 'axe', 'spear', 'sword', 'light', 'heavy'];
var fillCap   = { ram:25, catapult:25, spy:50, axe:50, spear:50, sword:50, light:50, heavy:50 };

/* =============== PAGE DETECTION =============== */
var Praca        = (game_data.screen === 'place' && !document.getElementById('troop_confirm_submit'));
var EnviarAtaque = (document.getElementById('troop_confirm_submit') !== null);

/* =============== UTILITIES =============== */
function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + value + ';expires=' + d.toGMTString() + ';path=/';
}
function getCookie(name) {
    var v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return v ? v[2] : null;
}
function deleteCookie(name) { setCookie(name, '', -1); }
function safeParse(str, def) { try { return JSON.parse(str) || def; } catch(e) { return def; } }
function getMaxUnits() {
    return safeParse(getCookie(maxUnitsCookieName), {spear:0,sword:0,axe:0,spy:0,light:0,heavy:0,ram:0,catapult:0});
}
function saveMaxUnits(obj) { setCookie(maxUnitsCookieName, JSON.stringify(obj), 365); }
function timeToSecs(h, m, s) { return h * 3600 + m * 60 + (s || 0); }

/* =============== NIGHT BONUS CHECK =============== */
function isBlocked(arrSecs) {
    var blockStart = parseInt(getCookie('nbStart') || 22, 10);
    var blockEnd   = parseInt(getCookie('nbEnd')   || 9,  10);
    var startSecs  = timeToSecs(blockStart, 0, 0);
    var endSecs    = timeToSecs(blockEnd,   0, 0);
    if (startSecs > endSecs) {
        return (arrSecs >= startSecs || arrSecs < endSecs);
    } else {
        return (arrSecs >= startSecs && arrSecs < endSecs);
    }
}

function isCoordBlocked(coordStr) {
    var parts   = coordStr.split('|');
    var myX     = game_data.village.x;
    var myY     = game_data.village.y;
    var dist    = Math.sqrt(Math.pow(myX - parseInt(parts[0], 10), 2) + Math.pow(myY - parseInt(parts[1], 10), 2));
    var speed   = getSlowestUnitSpeed();
    var arrival = new Date(new Date().getTime() + dist * speed * 60000);
    return isBlocked(timeToSecs(arrival.getHours(), arrival.getMinutes(), arrival.getSeconds()));
}

/* =============== UNIT HELPERS =============== */
function getAvailableUnits(u) {
    var el = document.getElementById('unit_input_' + u);
    return el ? parseInt(el.getAttribute('data-all-count'), 10) || 0 : 0;
}

function getEffectiveMax(u) {
    var cands  = safeParse(getCookie(candidateCookieName), {});
    if (cands[u] !== false) return getAvailableUnits(u);
    var maxObj = getMaxUnits();
    return Math.min(getAvailableUnits(u), parseInt(maxObj[u], 10) || 0);
}

function getSlowestUnitSpeed() {
    var cands   = safeParse(getCookie(candidateCookieName), {spear: true});
    var slowest = 0;
    for (var u in unitSpeeds) {
        if (cands[u] !== false && getAvailableUnits(u) > 0)
            slowest = Math.max(slowest, unitSpeeds[u]);
    }
    return slowest || unitSpeeds.scout;
}

function popFor(u) {
    return {spear:1, sword:1, axe:1, spy:2, light:4, heavy:6, ram:5, catapult:8}[u] || 0;
}

/* =============== TROOP CONFIGURATION =============== */
function buildConfig() {
    var reach2pct = getCookie(reach2pctCookieName) === 'true';
    var pct       = parseFloat(getCookie(fakePctCookieName) || '2') / 100;
    var pts       = game_data.village.points;
    var config    = {spear:0, sword:0, axe:0, spy:0, light:0, heavy:0, ram:0, catapult:0};
    var maxObj    = getMaxUnits();
    var cands     = safeParse(getCookie(candidateCookieName), {});

    if (reach2pct) {
        var fillMode  = getCookie(fillModeCookieName) || 'standard';
        var targetPop = Math.ceil(pts * pct);
        var currentPop = 0;

        if (fillMode === 'spy_focus') {
            if (getAvailableUnits('ram') > 0) { config.ram = 1; currentPop += popFor('ram'); }
            else if (getAvailableUnits('catapult') > 0) { config.catapult = 1; currentPop += popFor('catapult'); }
            var spyAvail = getAvailableUnits('spy');
            while (config.spy < spyAvail && currentPop < targetPop) {
                config.spy++; currentPop += popFor('spy');
            }
            var restOrder = ['ram', 'catapult', 'axe', 'spear', 'sword', 'light', 'heavy'];
            for (var j = 0; j < restOrder.length && currentPop < targetPop; j++) {
                var ru = restOrder[j];
                var rAvail = getAvailableUnits(ru);
                while (config[ru] < rAvail && currentPop < targetPop) {
                    config[ru]++; currentPop += popFor(ru);
                }
            }
        } else {
            if (getAvailableUnits('spy') > 0) { config.spy = 1; currentPop += popFor('spy'); }
            if (getAvailableUnits('ram') > 0) { config.ram = 1; currentPop += popFor('ram'); }

            for (var i = 0; i < fillOrder.length && currentPop < targetPop; i++) {
                var u   = fillOrder[i];
                var cap = fillCap[u];
                var avail = getAvailableUnits(u);
                var current = config[u];
                while (current < cap && current < avail && currentPop < targetPop) {
                    current++;
                    currentPop += popFor(u);
                }
                config[u] = current;
            }
        }
    } else {
        Object.keys(config).forEach(function(u) {
            if (cands[u] !== false || (parseInt(maxObj[u], 10) || 0) > 0) {
                config[u] = getEffectiveMax(u);
            }
        });
    }

    var total = 0;
    for (var k in config) total += config[k];
    return total > 0 ? config : null;
}

/* =============== FILL UNITS =============== */
function fillUnits(config) {
    var maxObj = getMaxUnits();
    var cands  = safeParse(getCookie(candidateCookieName), {});
    var units  = ['spear','sword','axe','spy','light','heavy','ram','catapult'];
    units.forEach(function(u) {
        var scriptBox = document.getElementById('max_' + u);
        var gameInput = document.getElementById('unit_input_' + u);
        if (!gameInput) return;
        var val = 0;
        if (scriptBox && scriptBox.value && scriptBox.value !== 'all') {
            val = parseInt(scriptBox.value, 10) || 0;
        } else if (config && config[u]) {
            val = config[u];
        }
        var avail = getAvailableUnits(u);
        val = Math.min(val, avail);
        if (val > 0) { gameInput.value = ''; gameInput.value = val; }
    });
}

function villageSwitch() {
    var btn = document.getElementById('village_switch_right') || document.querySelector('.arrowRight');
    if (btn) btn.href ? window.location.href = btn.href : btn.click();
}

/* =============== SYNC TEMPLATE TO BOXES =============== */
function syncTemplateToScriptBoxes(templateName) {
    if (!templateName) return;

    var links = document.querySelectorAll('a.troop_template_selector');
    var found = false;
    for (var i = 0; i < links.length; i++) {
        if (links[i].textContent.trim() === templateName) {
            links[i].click(); found = true; break;
        }
    }
    if (!found) { updateStatus('❌ Modelo não encontrado'); return; }

    setTimeout(function() {
        var current = safeParse(getCookie(candidateCookieName), {});
        var maxObj  = getMaxUnits();
        Object.keys(unitImgs).forEach(function(u) {
            var gameInput   = document.getElementById('unit_input_' + u);
            var scriptCheck = document.getElementById('cand_' + u);
            var scriptMax   = document.getElementById('max_' + u);
            if (!gameInput || !scriptCheck || !scriptMax) return;
            var val = parseInt(gameInput.value, 10) || 0;
            scriptCheck.checked = false;
            scriptMax.disabled  = false;
            scriptMax.value     = val;
            current[u] = false;
            maxObj[u]  = val;
            gameInput.value = '';
        });
        setCookie(candidateCookieName, JSON.stringify(current), 365);
        saveMaxUnits(maxObj);
        updateStats();
        updateStatus('✅ Modelo carregado — podes alterar os valores antes de iniciar');
    }, 400);
}

/* =============== TARGET CALCULATION =============== */
function calculateTargets() {
    var coordsSource = localStorage.getItem('fakeCoords') || getCookie('fakeCoords') || '';
    var allCoords    = coordsSource.trim().split(/[\s\r\n,;]+/).filter(function(c){ return c.includes('|'); });
    var apv          = parseInt(getCookie(attacksPerVillageCookieName) || 1, 10);
    var totalAttacks = allCoords.length * apv;
    var attacksDone  = parseInt(getCookie('fakeAttacksDone') || 0, 10);

    var div = document.getElementById('targetStatsDiv');
    if (div) {
        var display = totalAttacks > 0 ? Math.min(attacksDone + 1, totalAttacks) : 0;
        div.textContent = 'Aldeia ' + display + '/' + totalAttacks;
        div.style.color = totalAttacks > 0 ? '#4a9eff' : 'red';
        div.style.fontWeight = 'bold';
        div.style.fontSize = '13px';
    }
    return { total: totalAttacks, done: attacksDone, coords: allCoords };
}

/* =============== UI HELPERS =============== */
function updateStatus(msg) {
    var el = document.getElementById('statusDiv');
    if (el) el.innerHTML = msg;
}
function updateStats() { if (Praca) calculateTargets(); }
function updateReach2pctLabel() {
    var lbl = document.getElementById('reach2pctLabel');
    var chk = document.getElementById('reach2pctCheck');
    var pct = document.getElementById('fakePctInput');
    if (!lbl || !chk || !pct) return;
    lbl.textContent = chk.checked ? 'Atingir ' + pct.value + '% mínimo' : '';
}

/* =============== DRAGGABLE =============== */
function makeDraggable(panel, handle) {
    var dragging = false, offX = 0, offY = 0;
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        var r  = panel.getBoundingClientRect();
        offX   = e.clientX - r.left;
        offY   = e.clientY - r.top;
        panel.style.left   = r.left + 'px';
        panel.style.top    = r.top  + 'px';
        panel.style.right  = 'auto';
        panel.style.bottom = 'auto';
        e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        panel.style.left = (e.clientX - offX) + 'px';
        panel.style.top  = (e.clientY - offY) + 'px';
    });
    document.addEventListener('mouseup', function() { dragging = false; });
}

/* =============== CREATE UI =============== */
function createUI() {
    if (document.getElementById('fakesUI')) return;

    var style = document.createElement('style');
    style.textContent =
        '#fakesUI{position:fixed;top:60px;right:10px;background:#1a1f2e;border:2px solid #3d5a99;' +
        'border-radius:6px;z-index:999999;font-family:Arial,sans-serif;font-size:12px;width:300px;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.6);color:#e0e6f0;}' +
        '#fakesHead{background:linear-gradient(135deg,#1e3a6e,#2d4f8a);color:#fff;padding:7px 10px;font-weight:bold;' +
        'border-radius:4px 4px 0 0;user-select:none;display:flex;justify-content:space-between;align-items:center;' +
        'border-bottom:1px solid #3d5a99;}' +
        '#fakesBody{padding:10px;}' +
        '#fakesBody.is-minimized{display:none;}' +
        '#fakesUI select,#fakesUI input[type=number],#fakesUI input[type=text],#fakesUI textarea' +
        '{background:#0d1117;color:#c9d1d9;border:1px solid #3d5a99;border-radius:3px;}' +
        '#fakesUI .unit-groups-wrap{display:flex;gap:4px;margin-bottom:5px;}' +
        '#fakesUI .unit-group{flex:1;}' +
        '#fakesUI .unit-group-title{font-weight:bold;font-size:10px;color:#7aa2d4;' +
        'border-bottom:1px solid #3d5a99;margin-bottom:3px;padding-bottom:2px;text-align:center;}' +
        '#fakesUI .unit-row{display:flex;align-items:center;gap:2px;margin-bottom:3px;}' +
        '#fakesUI .unit-row img{width:18px;height:18px;flex-shrink:0;}' +
        '#fakesUI .unit-row input[type=text],#fakesUI .unit-row input[type=number]' +
        '{width:100%;padding:1px 2px;border:1px solid #3d5a99;border-radius:2px;' +
        'font-size:10px;text-align:center;box-sizing:border-box;min-width:0;background:#0d1117;color:#c9d1d9;}' +
        '#fakesUI .unit-row input:disabled{background:#161b22;color:#555;border-color:#2a3a55;}' +
        '#fakesUI .unit-row input[type=checkbox]{margin:0;flex-shrink:0;}' +
        '#fakesUI label{color:#a0b4d0;}' +
        '#fakesUI #reach2pctLabel{color:#7aa2d4;}';
    document.head.appendChild(style);

    var panel = document.createElement('div');
    panel.id = 'fakesUI';

    /* HEAD */
    var head = document.createElement('div');
    head.id = 'fakesHead';
    var headTitle = document.createElement('span');
    headTitle.textContent = 'Bota calor! Mete isso a rodar, preguiças.';
    var minBtn = document.createElement('button');
    minBtn.type = 'button';
    minBtn.textContent = '▲';
    minBtn.style.cssText = 'border:none;background:transparent;color:#fff;font-size:14px;cursor:pointer;padding:0 2px;line-height:1;';
    head.appendChild(headTitle);
    head.appendChild(minBtn);
    panel.appendChild(head);

    /* BODY */
    var panelBody = document.createElement('div');
    panelBody.id = 'fakesBody';
    panel.appendChild(panelBody);

    makeDraggable(panel, head);

    minBtn.onclick = function(e) {
        e.stopPropagation();
        panelBody.classList.toggle('is-minimized');
        if (panelBody.classList.contains('is-minimized')) {
            minBtn.textContent  = '▼';
            panel.style.width   = 'auto';
            panel.style.minWidth = '180px';
        } else {
            minBtn.textContent  = '▲';
            panel.style.width   = '300px';
            panel.style.minWidth = '';
        }
    };

    /* TEMPLATE SELECT */
    var savedTpl = getCookie('troopTemplateName') || '';
    var tplSelect = document.createElement('select');
    tplSelect.id = 'troopTemplateSelect';
    tplSelect.style.cssText = 'width:100%;margin-bottom:5px;font-size:11px;';
    var tplDefault = document.createElement('option');
    tplDefault.value = ''; tplDefault.textContent = '-- Usar os teus modelos de tropas --';
    tplSelect.appendChild(tplDefault);
    document.querySelectorAll('a.troop_template_selector').forEach(function(a) {
        var name = a.textContent.trim();
        if (!name) return;
        var opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        if (savedTpl === name) opt.selected = true;
        tplSelect.appendChild(opt);
    });
    panelBody.appendChild(tplSelect);

    /* BÓNUS NOTURNO */
    var sNbStart = getCookie('nbStart') || 22;
    var sNbEnd   = getCookie('nbEnd')   || 9;
    var nbDiv = document.createElement('div');
    nbDiv.style.cssText = 'background:linear-gradient(135deg,#0d1117,#161b22);border:1px solid #3d5a99;' +
        'border-radius:5px;padding:6px 8px;display:flex;align-items:center;gap:5px;margin-bottom:8px;flex-wrap:wrap;';
    nbDiv.innerHTML =
        '<span style="font-size:14px">🌙</span>' +
        '<span style="font-weight:bold;color:#c9a0ff;font-size:10px;white-space:nowrap">Bónus noturno</span>' +
        '<span style="color:#a0a0c0;font-size:10px">Das</span>' +
        '<input type="number" id="ui_nb_start" value="' + sNbStart + '" min="0" max="23" ' +
            'style="width:36px;background:#0d0d1a;color:#c9a0ff;border:1px solid #4a3060;' +
            'border-radius:3px;text-align:center;font-weight:bold;font-size:11px">' +
        '<span style="color:#a0a0c0;font-size:10px">h às</span>' +
        '<input type="number" id="ui_nb_end" value="' + sNbEnd + '" min="0" max="23" ' +
            'style="width:36px;background:#0d0d1a;color:#c9a0ff;border:1px solid #4a3060;' +
            'border-radius:3px;text-align:center;font-weight:bold;font-size:11px">' +
        '<span style="color:#a0a0c0;font-size:10px">h</span>' +
        '<button id="saveNB" style="margin-left:4px;padding:2px 8px;background:#4a3060;' +
            'color:#c9a0ff;border:1px solid #6a50a0;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold">' +
            '💾 Guardar</button>';
    panelBody.appendChild(nbDiv);

    /* FAKE % */
    var pctVal    = getCookie(fakePctCookieName) || '2';
    var reach2pct = getCookie(reach2pctCookieName) === 'true';
    var fillMode  = getCookie(fillModeCookieName) || 'standard';

    var pctDiv = document.createElement('div');
    pctDiv.style.cssText = 'margin-bottom:4px;display:flex;align-items:center;gap:6px;';
    pctDiv.innerHTML =
        '<span style="color:#a0b4d0">Fake %:</span> <input type="number" id="fakePctInput" value="' + pctVal + '" step="0.1" min="0.1" style="width:50px"> ' +
        '<input type="checkbox" id="reach2pctCheck" ' + (reach2pct ? 'checked' : '') + '> ' +
        '<label for="reach2pctCheck" id="reach2pctLabel" style="font-size:11px;color:#7aa2d4">' +
        (reach2pct ? 'Atingir ' + pctVal + '% mínimo' : '') + '</label>';
    panelBody.appendChild(pctDiv);

    var fillModeDiv = document.createElement('div');
    fillModeDiv.id = 'fillModeDiv';
    fillModeDiv.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:#0d1117;border:1px solid #3d5a99;border-radius:4px;font-size:11px;display:' + (reach2pct ? 'block' : 'none') + ';';
    fillModeDiv.innerHTML =
        '<div style="color:#7aa2d4;margin-bottom:4px;font-weight:bold">Modo de preenchimento:</div>' +
        '<label style="display:flex;align-items:center;gap:5px;margin-bottom:3px;cursor:pointer;">' +
            '<input type="radio" name="fillMode" id="fillModeStandard" value="standard" ' + (fillMode === 'standard' ? 'checked' : '') + '>' +
            '<span style="color:#c9d1d9">Mais arietes e catapultas</span>' +
        '</label>' +
        '<label style="display:flex;align-items:center;gap:5px;cursor:pointer;">' +
            '<input type="radio" name="fillMode" id="fillModeSpyFocus" value="spy_focus" ' + (fillMode === 'spy_focus' ? 'checked' : '') + '>' +
            '<span style="color:#c9d1d9">1 ariete/cata + exploradores</span>' +
        '</label>';
    panelBody.appendChild(fillModeDiv);

    /* CATAPULT TARGET */
    var catTarget = getCookie(catapultTargetCookieName) || 'Edifício principal';
    var catBuildings = [
        'Edifício principal','Quartel','Estábulo','Oficina','Torre de vigia',
        'Academia','Ferreiro','Praça de Reuniões','Estátua','Mercado',
        'Bosque','Poço de Argila','Mina de Ferro','Fazenda','Armazém','Muralha'
    ];
    var catDiv = document.createElement('div');
    catDiv.style.cssText = 'margin-bottom:8px;padding:6px 8px;background:#0d1117;border:1px solid #3d5a99;border-radius:4px;font-size:11px;';
    catDiv.innerHTML =
        '<div style="color:#7aa2d4;margin-bottom:4px;font-weight:bold">🎯 Alvo das catapultas:</div>' +
        '<select id="catapultTargetSelect" style="width:100%;font-size:11px;padding:2px;">' +
        catBuildings.map(function(b) {
            return '<option value="' + b + '"' + (catTarget === b ? ' selected' : '') + '>' + b + '</option>';
        }).join('') +
        '</select>';
    panelBody.appendChild(catDiv);

    /* UNIT BOXES */
    var cands    = safeParse(getCookie(candidateCookieName), {spear:true,sword:true,axe:true,spy:false,light:true,heavy:true,ram:true,catapult:true});
    var maxUnits = getMaxUnits();
    var groupsWrap = document.createElement('div');
    groupsWrap.className = 'unit-groups-wrap';
    Object.keys(unitGroups).forEach(function(gName) {
        var gDiv = document.createElement('div');
        gDiv.className = 'unit-group';
        gDiv.innerHTML = '<div class="unit-group-title">' + gName + '</div>';
        unitGroups[gName].forEach(function(u) {
            var checked = cands[u] !== false;
            var row = document.createElement('div');
            row.className = 'unit-row';
            row.innerHTML =
                '<input type="checkbox" id="cand_' + u + '" ' + (checked ? 'checked' : '') + '>' +
                '<img src="' + unitImgs[u] + '" title="' + u + '">' +
                '<input type="text" id="max_' + u + '" value="' + (checked ? 'all' : (maxUnits[u] || '')) + '" ' +
                'placeholder="qtd" ' + (checked ? 'disabled' : '') + '>';
            gDiv.appendChild(row);
        });
        groupsWrap.appendChild(gDiv);
    });
    panelBody.appendChild(groupsWrap);

    /* COORDS */
    var coordsDiv = document.createElement('div');
    coordsDiv.style.marginTop = '5px';
    coordsDiv.innerHTML =
        '<div style="font-weight:bold;font-size:11px;color:#d4956a;margin-bottom:2px">Coordenadas:</div>' +
        '<textarea id="coordsInput" style="width:100%;height:70px;font-size:10px;border:1px solid #8b4513;' +
            'border-radius:3px;padding:3px;box-sizing:border-box;resize:vertical" ' +
            'placeholder="500|500 501|500">' + (localStorage.getItem('fakeCoords') || getCookie('fakeCoords') || '') + '</textarea>' +
        '<button id="saveCoords" style="width:100%;padding:2px;background:#8b4513;color:#fff;border:none;' +
            'border-radius:3px;cursor:pointer;font-size:10px;margin-top:2px">💾 Guardar coordenadas</button>' +
        '<div style="margin-top:5px;display:flex;align-items:center;gap:6px">' +
            '<label style="font-size:11px;color:#a0b4d0">Ataques por aldeia:</label>' +
            '<input type="number" id="attacksPerVillage" value="' + (getCookie(attacksPerVillageCookieName) || 1) + '" ' +
            'min="1" style="width:45px;border:1px solid #8b4513;border-radius:2px;padding:2px 4px">' +
        '</div>';
    panelBody.appendChild(coordsDiv);

    /* STATS / START / STATUS */
    var statsDiv = document.createElement('div');
    statsDiv.id = 'targetStatsDiv';
    statsDiv.style.cssText = 'margin:8px 0 4px;font-weight:bold;color:#4a9eff;text-align:center';
    statsDiv.textContent = 'Calculating...';
    panelBody.appendChild(statsDiv);

    var isEnabled = getCookie(enabledCookieName) === 'true';
    var enableBtn = document.createElement('button');
    enableBtn.id = 'enableButton';
    enableBtn.style.cssText = 'width:100%;font-weight:bold;cursor:pointer;padding:5px;border:1px solid #000;' +
        'background:' + (isEnabled ? '#ff4444' : '#44ff44') + ';color:' + (isEnabled ? 'white' : 'black');
    enableBtn.textContent = isEnabled ? 'STOP' : 'START';
    panelBody.appendChild(enableBtn);

    var statusDiv = document.createElement('div');
    statusDiv.id = 'statusDiv';
    statusDiv.style.cssText = 'font-size:10px;text-align:center;margin-top:4px';
    statusDiv.textContent = 'Ready';
    panelBody.appendChild(statusDiv);

    var sigDiv = document.createElement('div');
    sigDiv.style.cssText = 'text-align:center;font-size:9px;color:#3d5a99;padding:4px 0 2px;border-top:1px solid #2a3a55;margin-top:4px;';
    sigDiv.innerHTML = '⚔️ FAKES MDS &nbsp;|&nbsp; <span style="color:#2a3a55">baseado no trabalho original de oSetas</span>';
    panelBody.appendChild(sigDiv);

    document.body.appendChild(panel);

    /* =============== EVENTS =============== */

    document.getElementById('saveNB').onclick = function() {
        setCookie('nbStart', document.getElementById('ui_nb_start').value, 365);
        setCookie('nbEnd',   document.getElementById('ui_nb_end').value,   365);
        this.innerHTML = '✅ Guardado';
        var btn = this;
        setTimeout(function(){ btn.innerHTML = '💾 Guardar'; }, 1500);
        updateStats();
    };

    document.getElementById('fakePctInput').onchange = function() {
        setCookie(fakePctCookieName, this.value, 365);
        updateReach2pctLabel(); updateStats();
    };
    document.getElementById('reach2pctCheck').onchange = function() {
        setCookie(reach2pctCookieName, this.checked, 365);
        var fmd = document.getElementById('fillModeDiv');
        if (fmd) fmd.style.display = this.checked ? 'block' : 'none';
        updateReach2pctLabel(); updateStats();
    };

    document.querySelectorAll('input[name="fillMode"]').forEach(function(radio) {
        radio.onchange = function() {
            setCookie(fillModeCookieName, this.value, 365);
        };
    });

    document.getElementById('catapultTargetSelect').onchange = function() {
        setCookie(catapultTargetCookieName, this.value, 365);
    };

    tplSelect.onchange = function() {
        setCookie('troopTemplateName', this.value, 365);
        syncTemplateToScriptBoxes(this.value);
    };

    ['spear','sword','axe','spy','light','heavy','ram','catapult'].forEach(function(u) {
        var chk   = document.getElementById('cand_' + u);
        var maxEl = document.getElementById('max_' + u);
        if (chk) chk.onchange = function() {
            var current = safeParse(getCookie(candidateCookieName), {});
            current[u] = this.checked;
            setCookie(candidateCookieName, JSON.stringify(current), 365);
            if (maxEl) { maxEl.disabled = this.checked; maxEl.value = this.checked ? 'all' : ''; }
            updateStats();
        };
        if (maxEl) maxEl.oninput = function() {
            if (this.value === 'all') return;
            var mo = getMaxUnits(); mo[u] = parseInt(this.value, 10) || 0;
            saveMaxUnits(mo); updateStats();
            this.style.borderColor = '#4a9eff';
            var el = this;
            setTimeout(function(){ el.style.borderColor = ''; }, 800);
        };
    });

    // Sanitiza automaticamente ao sair do campo — extrai só coordenadas X|Y de qualquer texto
    document.getElementById('coordsInput').addEventListener('blur', function() {
        var raw = this.value;
        var matches = raw.match(/\d{1,3}\|\d{1,3}/g);
        if (matches) {
            this.value = matches.join(' ');
        }
    });

    // *** CORRIGIDO: guarda sempre, sem comparar com o valor anterior ***
    document.getElementById('saveCoords').onclick = function() {
        var newCoords = document.getElementById('coordsInput').value.trim();
        localStorage.setItem('fakeCoords', newCoords);
        setCookie('fakeCoords', newCoords.substring(0, 500), 365); // fallback curto
        setCookie('fakeAttacksDone', 0, 1);
        updateStatus('✅ Coordenadas guardadas!');
        setTimeout(function(){ updateStatus('Ready'); }, 2000);
        updateStats();
    };

    document.getElementById('attacksPerVillage').onchange = function() {
        setCookie(attacksPerVillageCookieName, parseInt(this.value, 10) || 1, 365);
        updateStats();
    };

    enableBtn.onclick = function() {
        var on = getCookie(enabledCookieName) === 'true';
        setCookie(enabledCookieName, on ? 'false' : 'true', 365);
        this.textContent       = !on ? 'STOP' : 'START';
        this.style.background  = !on ? '#ff4444' : '#44ff44';
        this.style.color       = !on ? 'white'   : 'black';
        updateStatus(!on ? 'Script ENABLED' : 'Script DISABLED');
        if (!on) {
            setCookie('fakeAttacksDone', 0, 1);
            deleteCookie('showCongrats');
            deleteCookie(attackCookieName);
            deleteCookie('pendingVillageSwitch');
            main();
        }
    };

    updateStats();
}

/* =============== MAIN =============== */
async function main() {
    createUI();

    if (Praca) {

        var congratsTotal = getCookie('showCongrats');
        if (congratsTotal) {
            deleteCookie('showCongrats');

            // Som de conclusão — beeps ascendentes via Web Audio API
            try {
                var ctx = new (window.AudioContext || window.webkitAudioContext)();
                var notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
                notes.forEach(function(freq, i) {
                    var osc = ctx.createOscillator();
                    var gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
                    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + i * 0.18 + 0.05);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.18 + 0.25);
                    osc.start(ctx.currentTime + i * 0.18);
                    osc.stop(ctx.currentTime + i * 0.18 + 0.3);
                });
            } catch(e) {}

            var popup = document.createElement('div');
            popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
                'background:#1a1f2e;border:3px solid #3d5a99;border-radius:8px;padding:25px 30px;' +
                'z-index:9999999;font-family:Arial,sans-serif;text-align:center;' +
                'box-shadow:0 8px 24px rgba(0,0,0,.7);min-width:260px;color:#e0e6f0';
            popup.innerHTML =
                '<div style="font-size:40px;margin-bottom:8px">🏆</div>' +
                '<div style="font-size:17px;font-weight:bold;color:#7aa2d4;margin-bottom:8px">Parabéns, malandro! 😎</div>' +
                '<div style="font-size:13px;color:#a0b4d0;margin-bottom:16px">' +
                'Completaste os teus fakes diários!<br>' +
                '<b style="color:#fff">' + congratsTotal + ' ataques</b> enviados com sucesso.</div>' +
                '<button onclick="this.parentNode.remove()" style="background:#1e3a6e;color:#fff;' +
                'border:1px solid #3d5a99;border-radius:4px;padding:8px 24px;cursor:pointer;' +
                'font-size:13px;font-weight:bold">OK 👊</button>';
            document.body.appendChild(popup);
        }

        if (getCookie(enabledCookieName) !== 'true') return;

        if (getCookie('pendingVillageSwitch') === 'true') {
            deleteCookie('pendingVillageSwitch');
            updateStatus('🌙 A mudar aldeia...');
            setTimeout(villageSwitch, tempoSwitch);
            return;
        }

        if (getCookie(attackCookieName) === 'true') {
            deleteCookie(attackCookieName);
            setTimeout(villageSwitch, tempoSwitch);
            return;
        }

        var targets = calculateTargets();

        if (targets.total === 0) {
            updateStatus('Sem coordenadas. Insere e guarda coordenadas.');
            return;
        }

        var config = buildConfig();

        if (!config && getCookie('troopTemplateName')) {
            var fallback = {spear:0,sword:0,axe:0,spy:0,light:0,heavy:0,ram:0,catapult:0};
            var fallbackTotal = 0;
            ['spear','sword','axe','spy','light','heavy','ram','catapult'].forEach(function(u) {
                var avail = getAvailableUnits(u);
                if (avail > 0) { fallback[u] = avail; fallbackTotal += avail; }
            });
            config = fallbackTotal > 0 ? fallback : null;
        }

        if (!config) {
            updateStatus('Sem tropas, a mudar aldeia...');
            setTimeout(villageSwitch, tempoSwitch);
            return;
        }

        var coordIdx = targets.done % targets.coords.length;
        var t = targets.coords[coordIdx].split('|');

        var inputX = document.getElementById('inputx');
        var inputY = document.getElementById('inputy');
        if (!inputX.value || inputX.value !== t[0] || inputY.value !== t[1]) {
            inputX.value = t[0];
            inputY.value = t[1];
        }

        var attackDelay = getCookie('troopTemplateName') ? tempo + 800 : tempo;
        fillUnits(config);
        updateStatus('⚔️ Aldeia ' + (targets.done + 1) + '/' + targets.total + ' → ' + t.join('|'));
        setTimeout(function(){ document.getElementById('target_attack').click(); }, attackDelay);

    } else if (EnviarAtaque) {

        if (getCookie(enabledCookieName) !== 'true') return;

        var arrivalBlocked = false;
        var arrivalText    = '';
        try {
            var span = document.querySelector('#date_arrival span.relative_time');
            if (span) arrivalText = span.textContent.trim();
            if (arrivalText) {
                var m = arrivalText.match(/às (\d{1,2}):(\d{2}):(\d{2})/);
                if (m) arrivalBlocked = isBlocked(timeToSecs(parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)));
            }
        } catch(e) {}

        if (arrivalBlocked) {
            updateStatus('🌙 Bloqueado (' + arrivalText + '), a mudar aldeia...');
            setTimeout(function() {
                setCookie('pendingVillageSwitch', 'true', 1);
                history.back();
            }, tempo);
        } else {
            // Seleccionar edifício alvo das catapultas se houver catapultas no ataque
            var catInput = document.querySelector('input[name="catapult"]');
            var hasCats  = catInput && parseInt(catInput.value, 10) > 0;
            if (hasCats) {
                var targetBuilding = getCookie(catapultTargetCookieName) || 'Edifício principal';
                var buildingSelect = document.querySelector('select[name="building"]');
                if (buildingSelect) {
                    for (var bi = 0; bi < buildingSelect.options.length; bi++) {
                        if (buildingSelect.options[bi].text.trim() === targetBuilding) {
                            buildingSelect.selectedIndex = bi;
                            break;
                        }
                    }
                }
            }
            setCookie(attackCookieName, 'true', 1);
            var done     = parseInt(getCookie('fakeAttacksDone') || 0, 10);
            var newDone  = done + 1;
            setCookie('fakeAttacksDone', newDone, 1);
            var allCoords   = (localStorage.getItem('fakeCoords') || getCookie('fakeCoords') || '').trim().split(/[\s\n\r,;]+/).filter(function(c){ return c.includes('|'); });
            var apv         = parseInt(getCookie(attacksPerVillageCookieName) || 1, 10);
            var totalAtt    = allCoords.length * apv;
            if (newDone >= totalAtt) {
                setCookie('fakeAttacksDone', 0, 1);
                setCookie(enabledCookieName, 'false', 365);
                setCookie('showCongrats', totalAtt, 1);
                setTimeout(function(){ document.getElementById('troop_confirm_submit').click(); }, tempo);
            } else {
                setTimeout(function(){ document.getElementById('troop_confirm_submit').click(); }, tempo);
            }
        }
    }
}

/* =============== START =============== */
if (EnviarAtaque) {
    main();
} else if (Praca) {
    (function waitForTroops() {
        var spear     = document.getElementById('unit_input_spear');
        var templates = document.querySelectorAll('a.troop_template_selector');
        if (spear && spear.getAttribute('data-all-count') !== null && templates.length > 0) {
            main();
        } else {
            setTimeout(waitForTroops, 150);
        }
    })();
    console.log("Powered by MDS");
}
