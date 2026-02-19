<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    connectSocket,
    disconnectSocket,
    joinDungeon,
    onDungeonReady
  } from '../../services/socketService';
  import { getCharacters } from '../../services/api';
  import CharacterSelect from '../Character/CharacterSelect.svelte';
  import CharacterCreate from '../Character/CharacterCreate.svelte';
  import DungeonGame from './DungeonGame.svelte';
  import toast from 'svelte-french-toast';

  let socket;
  let currentView = 'select'; // 'select', 'create', 'game'
  let selectedCharacter = null;

  // Join-by-code state (independent of CharacterSelect's Play button)
  let joinCode = '';
  let joinCharacterId = ''; // selected in the join-panel dropdown
  let joinLoading = false;
  let pendingDungeonData = null; // full dungeonReady payload for the join flow

  // Characters list for the join dropdown
  let joinCharacters = [];

  onMount(async () => {
    socket = connectSocket();

    // Load characters for the join dropdown
    try {
      joinCharacters = await getCharacters();
    } catch (e) {
      // Non-fatal — join panel just won't have a dropdown
    }

    // Listen for dungeonReady here so we can catch the join flow.
    // DungeonGame also registers onDungeonReady in its own onMount, but
    // since the event fires before DungeonGame mounts we capture it here
    // and pass it as a prop.
    onDungeonReady((data) => {
      if (joinLoading) {
        joinLoading = false;
        pendingDungeonData = data;
        // selectedCharacter is already set from the join-panel dropdown
        currentView = 'game';
      }
    });
  });

  onDestroy(() => {
    disconnectSocket();
  });

  // ── Normal character play flow ────────────────────────────
  function handleCharacterSelect(event) {
    selectedCharacter = event.detail;
    pendingDungeonData = null;
    currentView = 'game';
  }

  function handleCreateCharacter() {
    currentView = 'create';
  }

  function handleCharacterCreated() {
    // Refresh join dropdown too
    getCharacters().then(c => { joinCharacters = c; }).catch(() => {});
    currentView = 'select';
  }

  function handleCancelCreate() {
    currentView = 'select';
  }

  function handleBackToSelect() {
    selectedCharacter = null;
    pendingDungeonData = null;
    joinCode = '';
    currentView = 'select';
  }

  // ── Join by code ──────────────────────────────────────────
  $: joinCharacter = joinCharacters.find(c => String(c.id) === String(joinCharacterId)) || null;

  function handleJoinSubmit() {
    const code = joinCode.trim();
    if (!code) {
      toast.error('Please enter a session code.');
      return;
    }
    if (!joinCharacter) {
      toast.error('Please select a character to join with.');
      return;
    }
    selectedCharacter = joinCharacter;
    joinLoading = true;
    joinDungeon(code, joinCharacter.id);

    // Timeout fallback
    setTimeout(() => {
      if (joinLoading) {
        joinLoading = false;
        selectedCharacter = null;
        toast.error('Session not found or already ended.');
      }
    }, 6000);
  }

  function handleJoinKeydown(e) {
    if (e.key === 'Enter') handleJoinSubmit();
  }
</script>

<div class="game-container">
  {#if currentView === 'select'}
    <CharacterSelect
      on:select={handleCharacterSelect}
      on:create={handleCreateCharacter}
    />

    <!-- ── Join a friend's dungeon ── -->
    <div class="join-panel">
      <h3>🔗 Join a Friend's Dungeon</h3>
      <p class="join-hint">Choose your character, paste the session code, then click Join.</p>

      <div class="join-fields">
        <!-- Character dropdown -->
        {#if joinCharacters.length > 0}
          <select
            class="join-select"
            bind:value={joinCharacterId}
            disabled={joinLoading}
          >
            <option value="">— Select character —</option>
            {#each joinCharacters as c}
              <option value={c.id}>{c.name} ({c.class}, Lv.{c.level})</option>
            {/each}
          </select>
        {:else}
          <p class="join-warning">⚠️ No characters found. Create one above first.</p>
        {/if}

        <!-- Code + join button -->
        <div class="join-row">
          <input
            class="join-input"
            type="text"
            placeholder="Session code…"
            bind:value={joinCode}
            on:keydown={handleJoinKeydown}
            maxlength="80"
            disabled={joinLoading}
          />
          <button
            class="join-btn"
            on:click={handleJoinSubmit}
            disabled={joinLoading || !joinCode.trim() || !joinCharacter}
          >
            {#if joinLoading}
              ⏳ Joining…
            {:else}
              Join
            {/if}
          </button>
        </div>
      </div>
    </div>

  {:else if currentView === 'create'}
    <CharacterCreate
      on:created={handleCharacterCreated}
      on:cancel={handleCancelCreate}
    />
  {:else if currentView === 'game' && selectedCharacter}
    <div class="game-header">
      <button on:click={handleBackToSelect}>← Back to Characters</button>
    </div>
    <DungeonGame
      character={selectedCharacter}
      initialDungeonData={pendingDungeonData}
    />
  {/if}
</div>

<style>
  .game-container {
    width: 100%;
    min-height: 100vh;
  }

  .game-header {
    padding: 1em;
    margin-bottom: 1em;
  }

  .game-header button {
    background-color: #333;
    border-color: #333;
  }

  .game-header button:hover {
    background-color: #444;
  }

  /* ── Join panel ──────────────────────────────────────── */
  .join-panel {
    max-width: 480px;
    margin: 2em auto;
    padding: 1.5em;
    background: #1e1e1e;
    border: 1px solid #444;
    border-radius: 12px;
    text-align: center;
  }

  .join-panel h3 {
    margin: 0 0 0.4em;
    color: #ffd700;
    font-size: 1.1em;
  }

  .join-hint {
    font-size: 0.82em;
    color: #888;
    margin: 0 0 1em;
  }

  .join-fields {
    display: flex;
    flex-direction: column;
    gap: 0.6em;
  }

  .join-select {
    width: 100%;
    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 0.9em;
    padding: 0.5em 0.75em;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .join-select:focus {
    border-color: #646cff;
  }

  .join-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .join-select option {
    background: #2a2a2a;
    color: #e0e0e0;
  }

  .join-row {
    display: flex;
    gap: 0.5em;
  }

  .join-input {
    flex: 1;
    background: #2a2a2a;
    border: 1px solid #555;
    border-radius: 6px;
    color: #e0e0e0;
    font-size: 0.9em;
    padding: 0.5em 0.75em;
    outline: none;
    transition: border-color 0.15s;
  }

  .join-input:focus {
    border-color: #646cff;
  }

  .join-input:disabled {
    opacity: 0.5;
  }

  .join-btn {
    background: #646cff;
    border-color: #646cff;
    border-radius: 6px;
    padding: 0.5em 1.2em;
    font-size: 0.9em;
    white-space: nowrap;
    transition: background 0.15s;
  }

  .join-btn:hover:not(:disabled) {
    background: #535bf2;
    border-color: #535bf2;
  }

  .join-btn:disabled {
    background: #333;
    border-color: #333;
    color: #666;
    cursor: not-allowed;
  }

  .join-warning {
    font-size: 0.78em;
    color: #f0a030;
    margin: 0.3em 0 0;
    text-align: center;
  }
</style>
