/******************** 全局变量 ********************/
let userCoins = parseInt(localStorage.getItem('wordDesktopCoins')) || 0;
let currentWords = [];                // 当前显示的单词列表
let currentModalWord = null;          // 当前弹窗中的单词对象
let currentCardElement = null;        // 当前弹窗对应的卡片 DOM 元素
let currentCardColor = '';
let clickTimer = null;
let challengeActive = false;
let challengeInterval = null;
let currentWordForChallenge = '';

// 暖色卡片池
const warmColors = ['#f9d6b2', '#f5b0b0', '#f5e3b3', '#c7e9b0', '#f9c7a2', '#e2b6d4', '#fec8af'];

// 布局常量（需与 CSS 中卡片宽高、内边距一致）
const CARD_WIDTH = 140;
const CARD_HEIGHT = 160;
const GAP_X = 30;
const GAP_Y = 30;
const DESK_PADDING = 40;

/******************** 公共函数 ********************/
function saveCoins() {
    localStorage.setItem('wordDesktopCoins', userCoins);
    document.querySelectorAll('#coinAmount').forEach(span => span.textContent = userCoins);
}

function addCoin(amount = 5) {   // 默认 +5（挑战成功）
    userCoins += amount;
    saveCoins();
}

function loadCoinsFromStorage() {
    userCoins = parseInt(localStorage.getItem('wordDesktopCoins')) || 0;
    saveCoins();
}

function randomRotate() {
    return (Math.random() * 20 - 10).toFixed(1) + 'deg';
}

/******************** 词库加载（PHP 接口）********************/
async function loadBook(bookKey) {
    try {
        const response = await fetch(`php/get_words.php?book=${bookKey}`);
        if (!response.ok) throw new Error('加载失败');
        const words = await response.json();
        currentWords = Array.isArray(words) ? words : [];
    } catch (error) {
        console.error('词库加载错误:', error);
        currentWords = [];
    }
    renderDeskCards();
}

/******************** 绝对定位布局函数 ********************/
// 计算每个卡片的位置（基于索引、容器宽度）
function computeCardPosition(index, totalCards, containerWidth) {
    const cols = Math.floor((containerWidth - DESK_PADDING * 2 + GAP_X) / (CARD_WIDTH + GAP_X));
    const effectiveCols = cols > 0 ? cols : 1; // 至少一列
    const row = Math.floor(index / effectiveCols);
    const col = index % effectiveCols;
    const left = DESK_PADDING + col * (CARD_WIDTH + GAP_X);
    const top = DESK_PADDING + row * (CARD_HEIGHT + GAP_Y);
    return { left, top };
}

// 更新所有卡片的位置（不重建 DOM）
function layoutCards() {
    const desk = document.getElementById('cardDesk');
    if (!desk) return;
    const containerWidth = desk.clientWidth;
    const cards = Array.from(desk.querySelectorAll('.word-card'));
    cards.forEach((card, idx) => {
        const pos = computeCardPosition(idx, cards.length, containerWidth);
        card.style.left = pos.left + 'px';
        card.style.top = pos.top + 'px';
    });
}

// 渲染卡片（首次创建或重新加载时调用）
function renderDeskCards() {
    const desk = document.getElementById('cardDesk');
    if (!desk) return;
    desk.innerHTML = ''; // 清空

    if (currentWords.length === 0) {
        desk.innerHTML = '<div style="text-align: center; color: #2c3e50; position: absolute; left:50%; top:50%; transform:translate(-50%,-50%);">暂无单词，请选择其他词书</div>';
        return;
    }

    // 为每个单词创建卡片
    currentWords.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'word-card';
        card.dataset.index = index;
        card.dataset.word = item.word;

        // 随机暖色
        const color = warmColors[Math.floor(Math.random() * warmColors.length)];
        card.style.backgroundColor = color;
        card.style.transform = `rotate(${randomRotate()})`; // 初始随机旋转

        card.textContent = item.word;
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            openCardModal(item, color, index);
        });
        desk.appendChild(card);
    });

    // 计算并设置位置
    layoutCards();

    // 监听窗口大小变化，重新布局
    window.addEventListener('resize', layoutCards);
}

/******************** FLIP 补位动画 ********************/
function flipCardsAfterRemoval(removedCard) {
    const desk = document.getElementById('cardDesk');
    const cards = Array.from(desk.querySelectorAll('.word-card')); // 当前所有卡片（不包括已移除的）

    // 记录旧位置（相对于视口）
    const oldRects = cards.map(card => card.getBoundingClientRect());

    // 从 DOM 中移除目标卡片（如果还在）
    if (removedCard && removedCard.parentNode === desk) {
        desk.removeChild(removedCard);
    }

    // 重新布局剩余卡片（计算新位置，但先不应用过渡）
    layoutCards();

    // 获取新位置
    const newRects = cards.map(card => card.getBoundingClientRect());

    // 应用 FLIP 动画
    cards.forEach((card, i) => {
        const oldRect = oldRects[i];
        const newRect = newRects[i];
        if (!oldRect || !newRect) return;

        const deltaX = oldRect.left - newRect.left;
        const deltaY = oldRect.top - newRect.top;

        if (deltaX === 0 && deltaY === 0) return;

        // 关闭过渡，瞬间移到旧位置
        card.style.transition = 'none';
        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        // 强制重绘
        card.offsetHeight;

        // 开启动画，回到新位置
        card.style.transition = 'transform 0.5s ease';
        card.style.transform = '';
    });

    // 动画结束后清除过渡样式
    setTimeout(() => {
        cards.forEach(card => {
            card.style.transition = '';
            card.style.transform = '';
        });
    }, 500);
}

/******************** 卡片弹窗及挑战 ********************/
function openCardModal(wordObj, cardColor, index) {
    currentModalWord = wordObj;
    currentCardColor = cardColor;

    // 找到对应的卡片 DOM 元素
    currentCardElement = Array.from(document.querySelectorAll('.word-card')).find(
        card => card.dataset.word === wordObj.word
    );

    const modal = document.getElementById('cardModal');
    const modalCard = document.getElementById('modalCard');
    modalCard.style.backgroundColor = cardColor;
    document.getElementById('modalWord').textContent = wordObj.word;
    document.getElementById('modalPhonetic').textContent = wordObj.phonetic || '';
    document.getElementById('modalDefinition').textContent = wordObj.definition || '';
    document.getElementById('modalDefinition').classList.add('hidden');
    document.getElementById('challengeArea').classList.add('hidden');
    document.querySelector('.modal-actions').classList.remove('hidden');
    challengeActive = false;
    if (challengeInterval) clearInterval(challengeInterval);
    modal.classList.remove('hidden');

    // 三击检测
    modalCard.dataset.clickCount = 0;
    modalCard.addEventListener('click', function tripleClickHandler(e) {
        e.stopPropagation();
        let count = parseInt(modalCard.dataset.clickCount || '0');
        count++;
        modalCard.dataset.clickCount = count;
        if (count === 3) {
            // 三击删除单词
            currentWords = currentWords.filter(w => w.word !== currentModalWord.word);
            renderDeskCards();  // 重新渲染（简单处理）
            closeModal();
        }
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { modalCard.dataset.clickCount = 0; }, 400);
    }, { once: true });
}

function closeModal() {
    document.getElementById('cardModal').classList.add('hidden');
    if (challengeInterval) clearInterval(challengeInterval);
    challengeActive = false;
}

function startChallenge() {
    if (!currentModalWord) return;
    challengeActive = true;
    document.querySelector('.modal-actions').classList.add('hidden');
    const challengeArea = document.getElementById('challengeArea');
    challengeArea.classList.remove('hidden');
    document.getElementById('modalDefinition').classList.add('hidden');
    const word = currentModalWord.word;
    currentWordForChallenge = word;
    document.getElementById('challengeWord').textContent = word;
    document.getElementById('spellInput').value = '';
    document.getElementById('spellMessage').textContent = '';
    let timeLeft = 10;
    const timerSpan = document.getElementById('timer');
    timerSpan.textContent = timeLeft + 's';
    if (challengeInterval) clearInterval(challengeInterval);
    challengeInterval = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft + 's';
        if (timeLeft <= 0) {
            clearInterval(challengeInterval);
        }
    }, 1000);
}

function submitSpell() {
    if (!challengeActive) return;
    const input = document.getElementById('spellInput').value.trim().toLowerCase();
    if (input === currentWordForChallenge.toLowerCase()) {
        // 挑战成功：金币 +5
        addCoin(5);

        // 显示成功提示浮层
        const toast = document.createElement('div');
        toast.className = 'toast-success';
        toast.textContent = '挑战成功！ +5金币';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1500);

        // 关闭弹窗
        closeModal();

        // 获取当前卡片元素
        const cardToRemove = currentCardElement;
        if (!cardToRemove) {
            // 降级：直接刷新
            currentWords = currentWords.filter(w => w.word !== currentModalWord.word);
            renderDeskCards();
            return;
        }

        // 从数据源中移除
        currentWords = currentWords.filter(w => w.word !== currentModalWord.word);

        // 给卡片添加炸开动画
        cardToRemove.classList.add('card-explode');

        // 延迟 0.5 秒（与炸开动画时长匹配）后执行补位
        setTimeout(() => {
            flipCardsAfterRemoval(cardToRemove);
        }, 500);
    } else {
        document.getElementById('spellMessage').textContent = '❌ 拼写错误';
    }
}

/******************** 首页初始化 ********************/
function initHomePage() {
    loadCoinsFromStorage();
    loadBook('primary'); // 默认加载小学词库

    // 词书下拉选择
    document.getElementById('bookSelect')?.addEventListener('change', (e) => {
        loadBook(e.target.value);
    });

    // “更多”按钮
    document.getElementById('moreBooksBtn')?.addEventListener('click', () => {
        document.getElementById('moreBooksMask').classList.remove('hidden');
    });

    // 关闭面板
    document.querySelectorAll('.close-panel').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });

    // 点击遮罩关闭
    document.getElementById('moreBooksMask')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('moreBooksMask')) {
            document.getElementById('moreBooksMask').classList.add('hidden');
        }
    });

    // 面板内词书选择
    document.querySelectorAll('.book-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const book = e.target.dataset.book;
            document.getElementById('bookSelect').value = book;
            loadBook(book);
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });

    // 刷新卡片（导航栏“卡片”按钮）
    document.querySelector('[data-page="refresh"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderDeskCards(); // 重新随机颜色和角度
    });

    // 发音
    document.getElementById('speakBtn')?.addEventListener('click', () => {
        if (!currentModalWord) return;
        const utterance = new SpeechSynthesisUtterance(currentModalWord.word);
        utterance.lang = 'en-US';
        speechSynthesis.speak(utterance);
    });

    // 显示/隐藏释义
    document.getElementById('toggleDefBtn')?.addEventListener('click', () => {
        document.getElementById('modalDefinition').classList.toggle('hidden');
    });

    // 挑战按钮
    document.getElementById('challengeBtn')?.addEventListener('click', startChallenge);
    document.getElementById('submitSpell')?.addEventListener('click', submitSpell);

    // 点击遮罩关闭弹窗
    const modalMask = document.getElementById('cardModal');
    modalMask.addEventListener('click', (e) => {
        if (e.target === modalMask) closeModal();
    });

    // 窗口改变时重新布局卡片
    window.addEventListener('resize', () => {
        if (document.getElementById('cardDesk')) {
            layoutCards();
        }
    });
}

/******************** 我的单词页面 ********************/
let customGroups = {};
let activeGroup = '默认';

function initMyWordsPage() {
    loadCoinsFromStorage();

    const saved = localStorage.getItem('wordDesktopGroups');
    if (saved) {
        customGroups = JSON.parse(saved);
    } else {
        customGroups = {
            '我的生词': [
                { word: 'phenomenon', definition: '现象' },
                { word: 'diligent', definition: '勤奋的' }
            ]
        };
    }
    activeGroup = Object.keys(customGroups)[0] || '我的生词';
    renderGroupList();
    renderWordEditor(activeGroup);

    document.getElementById('createGroupBtn').addEventListener('click', () => {
        const newName = document.getElementById('newGroupName').value.trim();
        if (newName && !customGroups[newName]) {
            customGroups[newName] = [];
            saveGroups();
            renderGroupList();
            document.getElementById('newGroupName').value = '';
        }
    });

    document.getElementById('addWordBtn').addEventListener('click', () => {
        const word = document.getElementById('newWord').value.trim();
        const def = document.getElementById('newDefinition').value.trim();
        if (word && def && customGroups[activeGroup]) {
            customGroups[activeGroup].push({ word, definition: def });
            saveGroups();
            renderWordEditor(activeGroup);
            document.getElementById('newWord').value = '';
            document.getElementById('newDefinition').value = '';
        }
    });

    document.getElementById('loadToDeskBtn').addEventListener('click', () => {
        const wordsToLoad = customGroups[activeGroup] || [];
        localStorage.setItem('wordDesktopCustomWords', JSON.stringify(wordsToLoad));
        alert('已加载到桌面，请返回首页查看');
        window.location.href = 'index.html';
    });

    // 更多词书面板（与首页相同）
    document.getElementById('moreBooksBtn')?.addEventListener('click', () => {
        document.getElementById('moreBooksMask').classList.remove('hidden');
    });
    document.querySelectorAll('.close-panel').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });
    document.getElementById('moreBooksMask')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('moreBooksMask')) {
            document.getElementById('moreBooksMask').classList.add('hidden');
        }
    });
    document.querySelectorAll('.book-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const book = e.target.dataset.book;
            document.getElementById('bookSelect').value = book;
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });
}

function saveGroups() {
    localStorage.setItem('wordDesktopGroups', JSON.stringify(customGroups));
}

function renderGroupList() {
    const container = document.getElementById('groupList');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(customGroups).forEach(group => {
        const tag = document.createElement('span');
        tag.className = `group-tag ${group === activeGroup ? 'active' : ''}`;
        tag.textContent = group;
        tag.addEventListener('click', () => {
            activeGroup = group;
            renderGroupList();
            renderWordEditor(group);
        });
        container.appendChild(tag);
    });
}

function renderWordEditor(groupName) {
    const words = customGroups[groupName] || [];
    const editorDiv = document.getElementById('wordEditor');
    editorDiv.style.display = 'block';
    document.getElementById('currentGroupTitle').textContent = `编辑 - ${groupName}`;
    const itemsDiv = document.getElementById('wordItems');
    itemsDiv.innerHTML = '';
    words.forEach((w, idx) => {
        const row = document.createElement('div');
        row.className = 'word-row';
        row.innerHTML = `<span><b>${w.word}</b> ${w.definition}</span>
            <span><button class="delWord" data-index="${idx}">🗑️</button></span>`;
        itemsDiv.appendChild(row);
    });
    document.querySelectorAll('.delWord').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            customGroups[activeGroup].splice(idx, 1);
            saveGroups();
            renderWordEditor(activeGroup);
        });
    });
}

/******************** 关于页面 ********************/
function initAboutPage() {
    loadCoinsFromStorage();
    // 更多词书面板
    document.getElementById('moreBooksBtn')?.addEventListener('click', () => {
        document.getElementById('moreBooksMask').classList.remove('hidden');
    });
    document.querySelectorAll('.close-panel').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });
    document.getElementById('moreBooksMask')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('moreBooksMask')) {
            document.getElementById('moreBooksMask').classList.add('hidden');
        }
    });
}

/******************** 页面分发 ********************/
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('cardDesk')) {
        initHomePage();
    } else if (document.getElementById('groupList')) {
        initMyWordsPage();
    } else if (document.querySelector('.about-card')) {
        initAboutPage();
    }
});