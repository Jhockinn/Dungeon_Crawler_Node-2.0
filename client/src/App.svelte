<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { authStore } from './stores/authStore';
  import { gameStore } from './stores/gameStore';
  import { getCurrentUser } from './services/api';
  import { getCurrentRoute, navigateTo, ROUTES } from './utils/router';
  import {
    getSocket,
    sendGlobalChat,
    sendPartyChat,
    onGlobalChat,
    onPartyChat
  } from './services/socketService';
  import LoginPage from './pages/LoginPage.svelte';
  import RegisterPage from './pages/RegisterPage.svelte';
  import ForgotPasswordPage from './pages/ForgotPasswordPage.svelte';
  import VerifyEmailPage from './pages/VerifyEmailPage.svelte';
  import ResetPasswordPage from './pages/ResetPasswordPage.svelte';
  import GamePage from './pages/GamePage.svelte';
  import toast, { Toaster } from 'svelte-french-toast';

  let currentRoute = ROUTES.LOGIN;

  // ── Chat state ────────────────────────────────────────────
  let chatOpen = false;
  let activeTab = 'global'; // 'global' | 'party'
  let globalMessages = [];
  let partyMessages = [];
  let globalUnread = 0;
  let partyUnread = 0;
  let chatInput = '';
  let messagesEl; // bind to the scrollable messages div

  // Derived from gameStore
  let sessionId = null;
  let inDungeon = false;
  let currentUsername = '';

  const unsubGame = gameStore.subscribe(state => {
    sessionId = state.sessionId;
    inDungeon = state.inDungeon;
  });

  const unsubAuth = authStore.subscribe(state => {
    currentUsername = state.user?.username || '';
  });

  // Register socket listeners once the socket is available
  // We listen after mount so the socket is connected
  let chatListenersRegistered = false;

  function registerChatListeners() {
    if (chatListenersRegistered) return;
    const sock = getSocket();
    if (!sock) return;

    onGlobalChat((data) => {
      globalMessages = [...globalMessages, data];
      if (!chatOpen || activeTab !== 'global') globalUnread++;
      scrollToBottom('global');
    });

    onPartyChat((data) => {
      partyMessages = [...partyMessages, data];
      if (!chatOpen || activeTab !== 'party') partyUnread++;
      scrollToBottom('party');
    });

    chatListenersRegistered = true;
  }

  async function scrollToBottom(tab) {
    if (tab !== activeTab || !chatOpen) return;
    await tick();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function switchTab(tab) {
    activeTab = tab;
    if (tab === 'global') globalUnread = 0;
    if (tab === 'party') partyUnread = 0;
    await tick();
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function toggleChat() {
    chatOpen = !chatOpen;
    if (chatOpen) {
      if (activeTab === 'global') globalUnread = 0;
      if (activeTab === 'party') partyUnread = 0;
      await tick();
      if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function handleChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function sendMessage() {
    const msg = chatInput.trim();
    if (!msg) return;
    if (activeTab === 'global') {
      sendGlobalChat(msg);
    } else if (activeTab === 'party' && sessionId) {
      sendPartyChat(sessionId, msg);
    }
    chatInput = '';
  }

  // ── App lifecycle ─────────────────────────────────────────
  onMount(async () => {
    currentRoute = getCurrentRoute();

    if ([ROUTES.VERIFY_EMAIL, ROUTES.RESET_PASSWORD].includes(currentRoute)) {
      authStore.setLoading(false);
      return;
    }

    try {
      authStore.setLoading(true);
      const response = await getCurrentUser();
      authStore.setUser(response.user);

      if (![ROUTES.GAME].includes(currentRoute)) {
        currentRoute = ROUTES.GAME;
        navigateTo(ROUTES.GAME);
      }
    } catch (error) {
      authStore.setUser(null);
      if (currentRoute === ROUTES.GAME) {
        currentRoute = ROUTES.LOGIN;
        navigateTo(ROUTES.LOGIN);
      }
    } finally {
      authStore.setLoading(false);
    }

    // Try to register listeners now; if socket isn't connected yet,
    // we retry via a short interval until it connects
    const tryRegister = setInterval(() => {
      registerChatListeners();
      if (chatListenersRegistered) clearInterval(tryRegister);
    }, 500);
  });

  onDestroy(() => {
    unsubGame();
    unsubAuth();
  });

  // ── Auth event handlers ───────────────────────────────────
  function handleLoginSuccess() {
    currentRoute = ROUTES.GAME;
    navigateTo(ROUTES.GAME);
    // Re-try registering chat listeners after login (socket connects on game mount)
    chatListenersRegistered = false;
    const tryRegister = setInterval(() => {
      registerChatListeners();
      if (chatListenersRegistered) clearInterval(tryRegister);
    }, 500);
  }

  function handleShowRegister() {
    currentRoute = ROUTES.REGISTER;
    navigateTo(ROUTES.REGISTER);
  }

  function handleShowForgotPassword() {
    currentRoute = ROUTES.FORGOT_PASSWORD;
    navigateTo(ROUTES.FORGOT_PASSWORD);
  }

  function handleBackToLogin() {
    currentRoute = ROUTES.LOGIN;
    navigateTo(ROUTES.LOGIN);
  }

  async function handleLogout() {
    toast((t) => `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:200px">
        <span>Are you sure you want to logout?</span>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="toast-logout-confirm-${t.id}" style="padding:4px 12px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer">Logout</button>
          <button id="toast-logout-cancel-${t.id}" style="padding:4px 12px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer">Cancel</button>
        </div>
      </div>
    `, { duration: Infinity, id: 'logout-confirm' });

    const handler = async (e) => {
      if (e.target.id && e.target.id.startsWith('toast-logout-confirm-')) {
        toast.dismiss('logout-confirm');
        document.removeEventListener('click', handler);
        try {
          const { logout } = await import('./services/api');
          await logout();
          authStore.logout();
          currentRoute = ROUTES.LOGIN;
          navigateTo(ROUTES.LOGIN);
          chatOpen = false;
          globalMessages = [];
          partyMessages = [];
          globalUnread = 0;
          partyUnread = 0;
          chatListenersRegistered = false;
        } catch (error) {
          toast.error('Logout failed. Please try again.');
        }
      } else if (e.target.id && e.target.id.startsWith('toast-logout-cancel-')) {
        toast.dismiss('logout-confirm');
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }

  $: totalUnread = globalUnread + partyUnread;
  $: partyTabDisabled = !inDungeon;
</script>

<Toaster />

<main>
  {#if $authStore.loading}
    <div class="loading-screen">
      <div class="spinner"></div>
      <p>Loading...</p>
    </div>
  {:else if $authStore.isAuthenticated && currentRoute === ROUTES.GAME}
    <div class="app-header">
      <h1>🏰 Dungeon Crawler</h1>
      <div class="user-info">
        <span>Welcome, {$authStore.user?.username}!</span>
        <button class="logout-btn" on:click={handleLogout}>Logout</button>
      </div>
    </div>

    <GamePage />

    <!-- ── Floating Chat ─────────────────────────────────── -->
    <div class="chat-widget">
      <!-- Toggle button -->
      <button class="chat-toggle" on:click={toggleChat} title="Toggle chat">
        💬
        {#if totalUnread > 0 && !chatOpen}
          <span class="unread-badge">{totalUnread > 99 ? '99+' : totalUnread}</span>
        {/if}
      </button>

      {#if chatOpen}
        <div class="chat-panel">
          <!-- Header / tabs -->
          <div class="chat-header">
            <button
              class="tab-btn"
              class:active={activeTab === 'global'}
              on:click={() => switchTab('global')}
            >
              🌐 Global
              {#if globalUnread > 0 && activeTab !== 'global'}
                <span class="tab-badge">{globalUnread}</span>
              {/if}
            </button>
            <button
              class="tab-btn"
              class:active={activeTab === 'party'}
              disabled={partyTabDisabled}
              title={partyTabDisabled ? 'Enter a dungeon to use party chat' : ''}
              on:click={() => !partyTabDisabled && switchTab('party')}
            >
              ⚔️ Party
              {#if partyUnread > 0 && activeTab !== 'party'}
                <span class="tab-badge">{partyUnread}</span>
              {/if}
            </button>
            <button class="close-btn" on:click={toggleChat} title="Close chat">✕</button>
          </div>

          <!-- Messages -->
          <div class="chat-messages" bind:this={messagesEl}>
            {#if activeTab === 'global'}
              {#if globalMessages.length === 0}
                <p class="empty-msg">No messages yet. Say hello! 👋</p>
              {:else}
                {#each globalMessages as msg}
                  <div class="chat-msg">
                    <span
                      class="msg-author"
                      class:own={msg.username === currentUsername}
                    >{msg.username}</span>
                    <span class="msg-text">{msg.message}</span>
                  </div>
                {/each}
              {/if}
            {:else}
              {#if partyMessages.length === 0}
                <p class="empty-msg">No party messages yet.</p>
              {:else}
                {#each partyMessages as msg}
                  <div class="chat-msg party">
                    <span
                      class="msg-author"
                      class:own={msg.username === currentUsername}
                    >{msg.username}</span>
                    <span class="msg-text">{msg.message}</span>
                  </div>
                {/each}
              {/if}
            {/if}
          </div>

          <!-- Input -->
          <div class="chat-input-row">
            <input
              class="chat-input"
              type="text"
              placeholder={activeTab === 'global' ? 'Message everyone…' : 'Message your party…'}
              bind:value={chatInput}
              on:keydown={handleChatKeydown}
              maxlength="200"
              disabled={activeTab === 'party' && partyTabDisabled}
            />
            <button
              class="send-btn"
              on:click={sendMessage}
              disabled={(activeTab === 'party' && partyTabDisabled) || !chatInput.trim()}
              title="Send (Enter)"
            >➤</button>
          </div>
        </div>
      {/if}
    </div>
    <!-- ── /Floating Chat ────────────────────────────────── -->

  {:else}
    <div class="auth-container">
      <h1>🏰 Dungeon Crawler</h1>

      {#if currentRoute === ROUTES.LOGIN}
        <LoginPage
          on:success={handleLoginSuccess}
          on:forgotPassword={handleShowForgotPassword}
          on:register={handleShowRegister}
        />
      {:else if currentRoute === ROUTES.REGISTER}
        <RegisterPage
          on:success={handleBackToLogin}
          on:login={handleBackToLogin}
        />
      {:else if currentRoute === ROUTES.FORGOT_PASSWORD}
        <ForgotPasswordPage on:cancel={handleBackToLogin} />
      {:else if currentRoute === ROUTES.VERIFY_EMAIL}
        <VerifyEmailPage />
      {:else if currentRoute === ROUTES.RESET_PASSWORD}
        <ResetPasswordPage />
      {/if}
    </div>
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    width: 100%;
  }

  .loading-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }

  .spinner {
    border: 4px solid #333;
    border-top: 4px solid #646cff;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    animation: spin 1s linear infinite;
    margin-bottom: 1em;
  }

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em 2em;
    background-color: #1a1a1a;
    border-bottom: 2px solid #333;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .app-header h1 {
    margin: 0;
    font-size: 2em;
    color: #ffd700;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 1em;
  }

  .logout-btn {
    background-color: #f44336;
    border-color: #f44336;
  }

  .logout-btn:hover {
    background-color: #da190b;
  }

  .auth-container {
    max-width: 500px;
    margin: 0 auto;
    padding: 2em;
    text-align: center;
    padding-top: 5em;
  }

  .auth-container h1 {
    font-size: 3em;
    margin-bottom: 1.5em;
    color: #ffd700;
  }

  /* ── Chat Widget ──────────────────────────────────────── */
  .chat-widget {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 500;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .chat-toggle {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: #2a2a3a;
    border: 2px solid #646cff;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    transition: background 0.2s, transform 0.15s;
    padding: 0;
  }

  .chat-toggle:hover {
    background: #3a3a5a;
    transform: scale(1.08);
  }

  .unread-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: #f44336;
    color: #fff;
    font-size: 0.6rem;
    font-weight: bold;
    border-radius: 10px;
    min-width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border: 2px solid #1a1a1a;
  }

  .chat-panel {
    width: 320px;
    background: #1e1e2e;
    border: 1px solid #44446a;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.15s ease-out;
  }

  @keyframes slideUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .chat-header {
    display: flex;
    align-items: center;
    background: #13131f;
    border-bottom: 1px solid #44446a;
    padding: 0.25rem 0.25rem 0 0.25rem;
    gap: 2px;
  }

  .tab-btn {
    position: relative;
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #aaa;
    font-size: 0.8rem;
    padding: 0.5rem 0.25rem;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    transition: color 0.15s, border-color 0.15s;
    white-space: nowrap;
  }

  .tab-btn:hover:not(:disabled) {
    color: #ccc;
    background: #1e1e2e;
  }

  .tab-btn.active {
    color: #fff;
    border-bottom-color: #646cff;
    background: #1e1e2e;
  }

  .tab-btn:disabled {
    color: #555;
    cursor: not-allowed;
  }

  .tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #f44336;
    color: #fff;
    font-size: 0.55rem;
    font-weight: bold;
    border-radius: 10px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    margin-left: 3px;
    vertical-align: middle;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #888;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.4rem 0.5rem;
    border-radius: 6px;
    line-height: 1;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: #fff;
  }

  .chat-messages {
    flex: 1;
    height: 240px;
    overflow-y: auto;
    padding: 0.6rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    scrollbar-width: thin;
    scrollbar-color: #44446a transparent;
  }

  .chat-messages::-webkit-scrollbar {
    width: 4px;
  }
  .chat-messages::-webkit-scrollbar-thumb {
    background: #44446a;
    border-radius: 2px;
  }

  .empty-msg {
    color: #666;
    font-size: 0.78rem;
    text-align: center;
    margin: auto;
  }

  .chat-msg {
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.3;
  }

  .msg-author {
    font-size: 0.7rem;
    font-weight: bold;
    color: #aaa;
  }

  .msg-author.own {
    color: #ffd700;
  }

  .chat-msg.party .msg-author {
    color: #9b7ee6;
  }

  .chat-msg.party .msg-author.own {
    color: #c9a0ff;
  }

  .msg-text {
    font-size: 0.82rem;
    color: #e0e0e0;
    word-break: break-word;
  }

  .chat-input-row {
    display: flex;
    gap: 0.4rem;
    padding: 0.5rem;
    border-top: 1px solid #44446a;
    background: #13131f;
  }

  .chat-input {
    flex: 1;
    background: #2a2a3a;
    border: 1px solid #44446a;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 0.82rem;
    padding: 0.4rem 0.6rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .chat-input:focus {
    border-color: #646cff;
  }

  .chat-input::placeholder {
    color: #666;
  }

  .chat-input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn {
    background: #646cff;
    border: none;
    border-radius: 6px;
    color: #fff;
    font-size: 0.9rem;
    width: 34px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    padding: 0;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: #535bf2;
  }

  .send-btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
  }
</style>
