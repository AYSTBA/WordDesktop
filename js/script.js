/******************** 全局变量 ********************/
let userCoins = 0; // 初始为0，每次刷新重置
let currentWords = [];                // 当前显示的单词列表
let currentModalWord = null;          // 当前弹窗中的单词对象
let currentCardElement = null;        // 当前弹窗对应的卡片 DOM 元素
let currentCardColor = '';
let clickTimer = null;
let challengeActive = false;
let challengeInterval = null;
let currentWordForChallenge = '';

// 发音冷却
let speakCooldown = false;

// 暖色卡片池
const warmColors = ['#f9d6b2', '#f5b0b0', '#f5e3b3', '#c7e9b0', '#f9c7a2', '#e2b6d4', '#fec8af'];

// 布局常量
const CARD_WIDTH = 140;
const CARD_HEIGHT = 160;
const GAP_X = 30;
const GAP_Y = 30;
const DESK_PADDING = 40;

/******************** 公共函数 ********************/
function saveCoins() {
    document.querySelectorAll('#coinAmount').forEach(span => span.textContent = userCoins);
}

function addCoin(amount = 5) {
    userCoins += amount;
    saveCoins();
}

function randomRotate() {
    return (Math.random() * 20 - 10).toFixed(1) + 'deg';
}

/******************** 词库加载（PHP 接口）并记忆上次选择 ********************/
async function loadBook(bookKey) {
    try {
        const response = await fetch(`php/get_words.php?book=${bookKey}`);
        if (!response.ok) throw new Error('加载失败');
        const words = await response.json();
        currentWords = Array.isArray(words) ? words : [];
        // 记住用户选择的词书
        localStorage.setItem('lastBook', bookKey);
    } catch (error) {
        console.error('词库加载错误:', error);
        currentWords = [];
    }
    renderDeskCards();
}

/******************** 绝对定位布局 ********************/
function computeCardPosition(index, totalCards, containerWidth) {
    const cols = Math.floor((containerWidth - DESK_PADDING * 2 + GAP_X) / (CARD_WIDTH + GAP_X));
    const effectiveCols = cols > 0 ? cols : 1;
    const row = Math.floor(index / effectiveCols);
    const col = index % effectiveCols;
    const left = DESK_PADDING + col * (CARD_WIDTH + GAP_X);
    const top = DESK_PADDING + row * (CARD_HEIGHT + GAP_Y);
    return { left, top };
}

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

function renderDeskCards() {
    const desk = document.getElementById('cardDesk');
    if (!desk) return;
    desk.innerHTML = '';

    if (currentWords.length === 0) {
        desk.innerHTML = '<div style="text-align: center; color: #2c3e50; position: absolute; left:50%; top:50%; transform:translate(-50%,-50%);">暂无单词，请选择其他词书</div>';
        return;
    }

    currentWords.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'word-card';
        card.dataset.index = index;
        card.dataset.word = item.word;

        const color = warmColors[Math.floor(Math.random() * warmColors.length)];
        card.style.backgroundColor = color;
        const rotate = randomRotate();
        card.style.transform = `rotate(${rotate})`;
        card.dataset.rotate = rotate; // 保存旋转值

        card.textContent = item.word;
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            openCardModal(item, color, index);
        });
        desk.appendChild(card);
    });

    layoutCards();
    window.addEventListener('resize', layoutCards);
}

/******************** FLIP 补位动画（保留旋转） ********************/
function flipCardsAfterRemoval(removedCard) {
    const desk = document.getElementById('cardDesk');
    const cards = Array.from(desk.querySelectorAll('.word-card'));

    // 保存每个卡片的原始旋转
    const originalRotations = cards.map(card => card.dataset.rotate || '0deg');

    const oldRects = cards.map(card => card.getBoundingClientRect());

    if (removedCard && removedCard.parentNode === desk) {
        desk.removeChild(removedCard);
    }

    layoutCards();

    const newRects = cards.map(card => card.getBoundingClientRect());

    cards.forEach((card, i) => {
        const oldRect = oldRects[i];
        const newRect = newRects[i];
        if (!oldRect || !newRect) return;

        const deltaX = oldRect.left - newRect.left;
        const deltaY = oldRect.top - newRect.top;

        if (deltaX === 0 && deltaY === 0) return;

        // 应用位移，但保留旋转
        card.style.transition = 'none';
        card.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${originalRotations[i]})`;
        card.offsetHeight;
        card.style.transition = 'transform 0.5s ease';
        card.style.transform = `rotate(${originalRotations[i]})`; // 回到原位，旋转保留
    });

    setTimeout(() => {
        cards.forEach(card => {
            card.style.transition = '';
            // 确保旋转值仍然存在
            card.style.transform = `rotate(${card.dataset.rotate || '0deg'})`;
        });
    }, 500);
}

/******************** 卡片弹窗 ********************/
function openCardModal(wordObj, cardColor, index) {
    currentModalWord = wordObj;
    currentCardColor = cardColor;

    currentCardElement = Array.from(document.querySelectorAll('.word-card')).find(
        card => card.dataset.word === wordObj.word
    );

    const modal = document.getElementById('cardModal');
    const modalCard = document.getElementById('modalCard');
    modalCard.style.backgroundColor = cardColor;

    // 重置单词和音标的显示（确保每次打开都可见）
    const modalWord = document.getElementById('modalWord');
    const modalPhonetic = document.getElementById('modalPhonetic');
    modalWord.style.display = 'block';
    modalPhonetic.style.display = 'block';
    modalWord.textContent = wordObj.word;
    modalPhonetic.textContent = wordObj.phonetic || '';

    document.getElementById('modalDefinition').textContent = wordObj.definition || '';
    document.getElementById('modalDefinition').classList.add('hidden');
    document.getElementById('challengeArea').classList.add('hidden');
    document.querySelector('.modal-actions').classList.remove('hidden');
    challengeActive = false;
    if (challengeInterval) clearInterval(challengeInterval);
    modal.classList.remove('hidden');

    // 移除之前可能存在的三击监听，避免重复
    const oldHandler = modalCard._tripleClickHandler;
    if (oldHandler) {
        modalCard.removeEventListener('click', oldHandler);
    }

    // 三击检测（非挑战状态）
    const tripleClickHandler = function(e) {
        e.stopPropagation(); // 防止影响按钮
        if (challengeActive) return;
        let count = parseInt(modalCard.dataset.clickCount || '0');
        count++;
        modalCard.dataset.clickCount = count;
        if (count === 3) {
            currentWords = currentWords.filter(w => w.word !== currentModalWord.word);
            renderDeskCards();
            closeModal();
        }
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { modalCard.dataset.clickCount = 0; }, 400);
    };
    modalCard.addEventListener('click', tripleClickHandler);
    modalCard._tripleClickHandler = tripleClickHandler; // 存储引用以便移除
}

function closeModal() {
    document.getElementById('cardModal').classList.add('hidden');
    if (challengeInterval) clearInterval(challengeInterval);
    challengeActive = false;
    document.removeEventListener('keydown', globalKeyHandler);
}

/******************** 挑战双阶段逻辑 ********************/
let memoryTimerInterval = null;
let spellTimerInterval = null;

function globalKeyHandler(e) {
    if (e.key === 'Enter') {
        if (!challengeActive) return;
        const memoryStage = document.getElementById('memoryStage');
        const spellStage = document.getElementById('spellStage');
        if (!memoryStage.classList.contains('hidden')) {
            // 记忆阶段：直接开始
            startSpellPhase();
        } else if (!spellStage.classList.contains('hidden')) {
            // 拼写阶段：提交拼写
            submitSpell();
        }
    }
}

function startChallenge() {
    if (!currentModalWord) return;
    challengeActive = true;

    // 隐藏大卡片上的单词和释义
    document.getElementById('modalWord').style.display = 'none';
    document.getElementById('modalPhonetic').style.display = 'none';
    document.querySelector('.modal-actions').classList.add('hidden');

    const challengeArea = document.getElementById('challengeArea');
    challengeArea.classList.remove('hidden');

    const memoryStage = document.getElementById('memoryStage');
    const spellStage = document.getElementById('spellStage');
    memoryStage.classList.remove('hidden');
    spellStage.classList.add('hidden');

    document.getElementById('memoryWord').textContent = currentModalWord.word;
    currentWordForChallenge = currentModalWord.word;

    let memoryTime = 10;
    const memoryTimerSpan = document.getElementById('memoryTimer');
    memoryTimerSpan.textContent = memoryTime + 's';

    if (memoryTimerInterval) clearInterval(memoryTimerInterval);
    memoryTimerInterval = setInterval(() => {
        memoryTime--;
        memoryTimerSpan.textContent = memoryTime + 's';
        if (memoryTime <= 0) {
            clearInterval(memoryTimerInterval);
            startSpellPhase();
        }
    }, 1000);

    document.getElementById('exitChallengeBtn').onclick = (e) => {
        e.stopPropagation();
        clearInterval(memoryTimerInterval);
        // 退出挑战，恢复单词显示
        document.getElementById('modalWord').style.display = 'block';
        document.getElementById('modalPhonetic').style.display = 'block';
        closeModal();
    };

    document.getElementById('startSpellBtn').onclick = (e) => {
        e.stopPropagation();
        clearInterval(memoryTimerInterval);
        startSpellPhase();
    };

    document.addEventListener('keydown', globalKeyHandler);
}

function startSpellPhase() {
    document.getElementById('memoryStage').classList.add('hidden');
    document.getElementById('spellStage').classList.remove('hidden');

    let spellTime = 8;
    const spellTimerSpan = document.getElementById('spellTimer');
    spellTimerSpan.textContent = spellTime + 's';
    document.getElementById('spellInput').value = '';
    document.getElementById('spellMessage').textContent = '';
    document.getElementById('spellInput').focus();

    if (spellTimerInterval) clearInterval(spellTimerInterval);
    spellTimerInterval = setInterval(() => {
        spellTime--;
        spellTimerSpan.textContent = spellTime + 's';
        if (spellTime <= 0) {
            clearInterval(spellTimerInterval);
            // 超时：直接关闭，无提示
            closeModal();
        }
    }, 1000);
}

function submitSpell() {
    if (!challengeActive) return;
    if (document.getElementById('spellStage').classList.contains('hidden')) return;

    const input = document.getElementById('spellInput').value.trim().toLowerCase();
    if (input === currentWordForChallenge.toLowerCase()) {
        clearInterval(spellTimerInterval);
        addCoin(5);
        showToast('🎉 挑战成功！ +5金币', 'success');

        closeModal();

        const cardToRemove = currentCardElement;
        if (!cardToRemove) {
            currentWords = currentWords.filter(w => w.word !== currentModalWord.word);
            renderDeskCards();
            return;
        }

        currentWords = currentWords.filter(w => w.word !== currentModalWord.word);
        cardToRemove.classList.add('card-explode');
        setTimeout(() => {
            flipCardsAfterRemoval(cardToRemove);
        }, 500);
    } else {
        document.getElementById('spellMessage').textContent = '❌ 拼写错误，再试试';
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
}

/******************** 首页初始化 ********************/
function initHomePage() {
    saveCoins(); // 初始显示0

    // 读取上次使用的词书，默认为 primary
    const lastBook = localStorage.getItem('lastBook') || 'primary';
    document.getElementById('bookSelect').value = lastBook;
    loadBook(lastBook);

    document.getElementById('bookSelect')?.addEventListener('change', (e) => {
        loadBook(e.target.value);
    });

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
            loadBook(book);
            document.getElementById('moreBooksMask').classList.add('hidden');
        });
    });

    document.querySelector('[data-page="refresh"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderDeskCards();
    });

    // 发音带冷却，并阻止冒泡
    document.getElementById('speakBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentModalWord) return;
        if (speakCooldown) return;
        speakCooldown = true;
        const utterance = new SpeechSynthesisUtterance(currentModalWord.word);
        utterance.lang = 'en-US';
        utterance.rate = 1.0; // 默认语速
        speechSynthesis.speak(utterance);
        setTimeout(() => {
            speakCooldown = false;
        }, 3000);
    });

    // 释义切换，阻止冒泡
    document.getElementById('toggleDefBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('modalDefinition').classList.toggle('hidden');
    });

    // 挑战按钮，阻止冒泡
    document.getElementById('challengeBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        startChallenge();
    });

    const modalMask = document.getElementById('cardModal');
    modalMask.addEventListener('click', (e) => {
        if (challengeActive) return;
        if (e.target === modalMask) closeModal();
    });

    window.addEventListener('resize', () => {
        if (document.getElementById('cardDesk')) {
            layoutCards();
        }
    });
}

/******************** 页面分发 ********************/
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('cardDesk')) {
        initHomePage();
    } else if (document.querySelector('.about-card')) {
        // 关于页面只需显示金币（始终0）
        document.querySelectorAll('#coinAmount').forEach(span => span.textContent = '0');
    }
});