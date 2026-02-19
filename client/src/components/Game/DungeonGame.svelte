<script>
  import { onMount, onDestroy } from 'svelte';
  import { gameStore } from '../../stores/gameStore';
  import toast from 'svelte-french-toast';
  import {
    startDungeon,
    movePlayer,
    attackEnemy,
    leaveDungeon,
    onDungeonReady,
    onPlayerMoved,
    onCombatUpdate,
    onEnemyDefeated,
    onEnemyEncounter,
    onPlayerDamaged,
    onPlayerDied,
    onDungeonCompleted,
    onLevelUp,
    useItemInDungeon,
    equipItemSocket,
    onItemDropped,
    onInventoryUpdated,
    onPlayerHealed,
    onExitBlocked,
    onPlayerJoined,
    onPlayerLeft,
    onExistingPlayers,
    giftItem,
    onGiftSent,
    onGiftReceived
  } from '../../services/socketService';
  import { getInventory, equipInventoryItem, dropInventoryItem } from '../../services/api';

  export let character;
  export let initialDungeonData = null;   // pre-captured dungeonReady payload for join flow

  let difficulty = 1;
  let sessionId = null;
  let maze = null;
  let enemies = [];
  let playerPos = { x: 1, y: 1 };
  let combatLog = [];
  let selectedEnemy = null;
  let gridKey = 0;
  let exitPoint = null;
  let inventory = [];
  let inventoryLoading = false;

  // ── Co-op: other players ──────────────────────────────────
  // Map of characterId → { position, name, class }
  let otherPlayers = new Map();

  // ── Gift UI state ─────────────────────────────────────────
  // inventoryId of the item whose gift form is open (null = none)
  let giftOpenFor = null;
  let giftUsername = '';
  let giftSending = false;

  $: gold = inventory
    .filter(i => i.type === 'gold')
    .reduce((sum, i) => sum + i.effect_value * i.quantity, 0);

  $: equippedWeapon = inventory.find(i => i.type === 'weapon' && i.equipped);
  $: equippedArmor  = inventory.find(i => i.type === 'armor'  && i.equipped);
  $: aliveEnemies   = enemies.filter(e => e.isAlive);
  $: allEnemiesDead = sessionId && aliveEnemies.length === 0;

  const unsubscribe = gameStore.subscribe(state => {
    sessionId = state.sessionId;
    maze = state.maze;
    enemies = state.enemies;
  });

  onMount(async () => {
    // Load persistent inventory via REST
    inventoryLoading = true;
    try {
      inventory = await getInventory(character.id);
    } catch (e) {
      toast.error('Failed to load inventory');
    } finally {
      inventoryLoading = false;
    }

    // Helper to bootstrap dungeon state from a dungeonReady payload
    function applyDungeonReady(data) {
      gameStore.startDungeon(data.sessionId, data.maze, data.enemies, data.character);
      exitPoint = data.exitPoint;
      if (data.inventory) inventory = data.inventory;
      otherPlayers = new Map(); // clear stale players
      addLog('Entered the dungeon!');
      toast.success('🏰 Entered the dungeon!');
    }

    // If joining a friend's dungeon, the dungeonReady event fired before this
    // component mounted. Game.svelte captured the payload and passes it as a prop.
    if (initialDungeonData) {
      applyDungeonReady(initialDungeonData);
    }

    onDungeonReady((data) => {
      // Skip if we already bootstrapped from initialDungeonData
      if (initialDungeonData && data.sessionId === initialDungeonData.sessionId) return;
      applyDungeonReady(data);
    });

    onItemDropped((data) => {
      const idx = inventory.findIndex(i => i.id === data.inventoryId);
      if (idx >= 0) {
        inventory[idx] = { ...inventory[idx], quantity: data.quantity };
      } else {
        inventory = [...inventory, {
          id: data.inventoryId,
          item_id: data.item.id,
          name: data.item.name,
          type: data.item.type,
          effect_value: data.item.effectValue,
          sprite_icon: data.item.spriteIcon,
          description: data.item.description,
          rarity: data.item.rarity,
          quantity: data.quantity,
          equipped: false
        }];
      }
      const rarityLabel = data.item.rarity === 'uncommon' ? ' ✨' : data.item.rarity === 'rare' ? ' 💎' : '';
      toast(`${data.item.spriteIcon} ${data.item.name}${rarityLabel} dropped!`, { duration: 2500 });
    });

    onInventoryUpdated((data) => {
      inventory = data.inventory;
    });

    onPlayerHealed((data) => {
      character.health = data.health;
      addLog(`💊 Used ${data.itemUsed.spriteIcon} ${data.itemUsed.name}! +${data.healAmount} HP`);
      toast.success(`💊 +${data.healAmount} HP restored!`, { duration: 2000 });
    });

    onExitBlocked((data) => {
      addLog(`🚫 ${data.message}`);
      toast.error(`🚫 ${data.message}`, { duration: 3000 });
    });

    onPlayerMoved((data) => {
      if (data.characterId === character.id) {
        playerPos = { x: data.position.x, y: data.position.y };
      } else {
        // Move another player on the grid
        const p = otherPlayers.get(data.characterId);
        if (p) {
          otherPlayers.set(data.characterId, { ...p, position: data.position });
          otherPlayers = otherPlayers; // trigger reactivity
        }
      }
      gridKey++;
    });

    onCombatUpdate((data) => {
      const enemyList = [...enemies];
      const enemy = enemyList.find(e => e.id === data.enemyId);

      if (enemy) {
        enemy.health = data.health;
        gameStore.updateEnemies(enemyList);
        addLog(`Hit ${enemy.name} for ${data.damage} damage!`);
        enemies = enemyList;

        if (selectedEnemy && selectedEnemy.id === data.enemyId) {
          selectedEnemy.health = data.health;
          selectedEnemy = selectedEnemy;
        }

        gridKey++;
      }
    });

    onEnemyDefeated((data) => {
      const enemyList = [...enemies];
      const enemy = enemyList.find(e => e.id === data.enemyId);
      if (enemy) {
        enemy.isAlive = false;
        gameStore.updateEnemies(enemyList);

        character.experience = data.currentXP;
        character.level = data.level;
        character.requiredXP = data.requiredXP;

        addLog(`💀 Defeated ${enemy.name}! +${data.xpGained} XP (${data.currentXP}/${data.requiredXP})`);
        toast.success(`💀 Defeated ${enemy.name}! +${data.xpGained} XP`);

        if (selectedEnemy && selectedEnemy.id === data.enemyId) {
          selectedEnemy = null;
          addLog('✅ You can move again!');
        }
      }
      gridKey++;
    });

    onEnemyEncounter((data) => {
      selectedEnemy = data.enemy;
      addLog(`⚔️ Encountered ${data.enemy.sprite} ${data.enemy.name}! Press SPACE or click Attack!`);
      toast(`⚔️ Encountered ${data.enemy.name}!`, {
        icon: data.enemy.sprite,
        duration: 2000
      });
      gridKey++;
    });

    onPlayerDamaged((data) => {
      if (data.characterId === character.id) {
        character.health = data.health;
        addLog(`💔 ${data.enemyName} hit you for ${data.damage} damage!`);

        if (data.health <= 20) {
          toast.error(`💔 ${data.enemyName} hit you for ${data.damage} damage! (${data.health}/${data.maxHealth} HP)`, {
            duration: 2000
          });
        }

        gridKey++;
      }
    });

    onPlayerDied((data) => {
      if (data.characterId === character.id) {
        character.health = data.health;
        toast.error('💀 You have been defeated!', {
          duration: 4000
        });
        setTimeout(() => {
          toast.success('✨ You have been healed and returned to safety!', {
            duration: 3000
          });
        }, 1000);

        setTimeout(() => {
          gameStore.leaveDungeon();
        }, 2000);
      }
    });

    onDungeonCompleted((data) => {
      character.health = data.health;
      toast.success('🎉 ' + data.message, {
        duration: 4000
      });
      setTimeout(() => {
        toast.success('✨ You have been fully healed!', {
          duration: 3000
        });
      }, 1000);

      setTimeout(() => {
        gameStore.leaveDungeon();
      }, 2000);
    });

    onLevelUp((data) => {
      character.level = data.newLevel;
      character.experience = data.currentXP;
      character.requiredXP = data.requiredXP;
      character.maxHealth = data.maxHealth;
      character.attack = data.attack;
      character.defense = data.defense;

      addLog(`🎊 LEVEL UP! Now level ${data.newLevel}!`);
      addLog(`📈 Stats: +${data.stats.healthIncrease} HP, +${data.stats.attackIncrease} ATK, +${data.stats.defenseIncrease} DEF`);

      toast.success(`🎊 LEVEL UP! You're now level ${data.newLevel}!`, {
        duration: 4000
      });

      setTimeout(() => {
        toast(`📈 +${data.stats.healthIncrease} HP | +${data.stats.attackIncrease} ATK | +${data.stats.defenseIncrease} DEF`, {
          icon: '⚡',
          duration: 3000
        });
      }, 500);

      gridKey++;
    });

    // ── Co-op events ──────────────────────────────────────────
    onPlayerJoined((data) => {
      otherPlayers.set(data.characterId, {
        position: data.position,
        name: data.characterName,
        class: data.characterClass
      });
      otherPlayers = otherPlayers;
      gridKey++;
      addLog(`👥 ${data.characterName} joined the dungeon!`);
      toast(`👥 ${data.characterName} joined!`, { duration: 3000 });
    });

    onPlayerLeft((data) => {
      otherPlayers.delete(data.characterId);
      otherPlayers = otherPlayers;
      gridKey++;
      if (data.characterName) {
        addLog(`👋 ${data.characterName} left the dungeon.`);
        toast(`👋 ${data.characterName} left.`, { duration: 2500 });
      }
    });

    onExistingPlayers((data) => {
      // data is an array of { characterId, characterName, characterClass, position }
      otherPlayers = new Map();
      for (const p of data) {
        otherPlayers.set(p.characterId, {
          position: p.position,
          name: p.characterName,
          class: p.characterClass
        });
      }
      gridKey++;
      if (data.length > 0) {
        addLog(`👥 ${data.length} other player(s) already in the dungeon.`);
      }
    });

    // ── Gift events ───────────────────────────────────────────
    onGiftSent((data) => {
      // Server sends back the full updated inventory
      if (data.inventory) {
        inventory = data.inventory;
      } else {
        // Fallback: manually remove/decrement
        const idx = inventory.findIndex(i => i.id === data.inventoryId);
        if (idx >= 0) {
          if (inventory[idx].quantity > 1) {
            inventory[idx] = { ...inventory[idx], quantity: inventory[idx].quantity - 1 };
          } else {
            inventory = inventory.filter(i => i.id !== data.inventoryId);
          }
        }
      }
      giftSending = false;
      toast.success(`🎁 Sent ${data.itemName} to ${data.toUsername}!`, { duration: 3000 });
      giftOpenFor = null;
      giftUsername = '';
    });

    onGiftReceived((data) => {
      toast.success(`🎁 ${data.fromUsername} sent you ${data.itemSpriteIcon} ${data.itemName}!`, { duration: 4000 });
      // Reload inventory from server
      getInventory(character.id).then(inv => { inventory = inv; }).catch(() => {});
    });

    window.addEventListener('keydown', handleKeyPress);

    // If we were passed a joinSessionId from Game.svelte, the dungeonReady
    // event has already been handled in Game.svelte's onDungeonReady which set
    // currentView = 'game'. We don't need to re-emit here.
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeyPress);
    unsubscribe();
  });

  function handleStartDungeon() {
    combatLog = [];
    startDungeon(character.id, difficulty);
  }

  // ── Clipboard helper ──────────────────────────────────────
  function copySessionCode() {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId).then(() => {
      toast.success('📋 Copied session code!', { duration: 1800 });
    }).catch(() => {
      toast.error('Could not copy to clipboard');
    });
  }

  // ── Inventory actions ─────────────────────────────────────
  function handleUsePotion(inv) {
    if (!sessionId) {
      toast.error('You can only use potions inside a dungeon!');
      return;
    }
    useItemInDungeon(sessionId, character.id, inv.id);
  }

  function handleEquipItem(inv) {
    equipItemSocket(character.id, inv.id);
  }

  async function handleDropItem(inv) {
    toast((t) => `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:200px">
        <span>Drop ${inv.sprite_icon} ${inv.name}?</span>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="toast-drop-confirm-${t.id}" style="padding:4px 12px;background:#f44336;color:#fff;border:none;border-radius:4px;cursor:pointer">Drop</button>
          <button id="toast-drop-cancel-${t.id}" style="padding:4px 12px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer">Cancel</button>
        </div>
      </div>
    `, { duration: Infinity, id: 'drop-confirm' });

    const handler = async (e) => {
      if (e.target.id && e.target.id.startsWith('toast-drop-confirm-')) {
        toast.dismiss('drop-confirm');
        document.removeEventListener('click', handler);
        try {
          await dropInventoryItem(character.id, inv.id);
          inventory = inventory.filter(i => i.id !== inv.id);
          toast.success(`Dropped ${inv.sprite_icon} ${inv.name}`);
        } catch (err) {
          toast.error(err.message);
        }
      } else if (e.target.id && e.target.id.startsWith('toast-drop-cancel-')) {
        toast.dismiss('drop-confirm');
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }

  // ── Gift item ─────────────────────────────────────────────
  function toggleGiftForm(invId) {
    if (giftOpenFor === invId) {
      giftOpenFor = null;
      giftUsername = '';
    } else {
      giftOpenFor = invId;
      giftUsername = '';
    }
  }

  function handleGiftKeydown(e, inv) {
    if (e.key === 'Enter') sendGift(inv);
    if (e.key === 'Escape') { giftOpenFor = null; giftUsername = ''; }
  }

  function sendGift(inv) {
    const to = giftUsername.trim();
    if (!to) { toast.error('Enter a username to gift to.'); return; }
    giftSending = true;
    giftItem(character.id, inv.id, to);
    // giftSending reset by onGiftSent handler
    setTimeout(() => { giftSending = false; }, 6000);
  }

  // ── Keyboard input ────────────────────────────────────────
  function handleKeyPress(e) {
    if (!sessionId) return;
    // Don't capture keys when typing in an input
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    if (e.key.toLowerCase() === 'e') {
      const potion = inventory.find(i => i.type === 'potion');
      if (potion) {
        e.preventDefault();
        handleUsePotion(potion);
      }
      return;
    }

    if (selectedEnemy && selectedEnemy.isAlive) {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        handleAttack();
      }
      return;
    }

    const key = e.key.toLowerCase();
    let direction = null;

    if (key === 'w' || key === 'arrowup') direction = 'up';
    else if (key === 's' || key === 'arrowdown') direction = 'down';
    else if (key === 'a' || key === 'arrowleft') direction = 'left';
    else if (key === 'd' || key === 'arrowright') direction = 'right';

    if (direction) {
      e.preventDefault();
      movePlayer(sessionId, character.id, direction);
    }
  }

  function handleAttack() {
    if (selectedEnemy && selectedEnemy.isAlive) {
      attackEnemy(sessionId, character.id, selectedEnemy.id);
    }
  }

  function handleMoveButton(direction) {
    if (selectedEnemy && selectedEnemy.isAlive) {
      addLog('❌ Cannot move while in combat!');
      toast.error('❌ Cannot move while in combat!', { duration: 1500 });
      return;
    }
    if (sessionId) {
      movePlayer(sessionId, character.id, direction);
    }
  }

  function handleLeaveDungeon() {
    if (aliveEnemies.length > 0) {
      toast.error(`🚫 Defeat all monsters first! ${aliveEnemies.length} remaining.`, { duration: 3000 });
      return;
    }

    toast((t) => `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:220px">
        <span>Leave the dungeon? You will be healed to full HP.</span>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="toast-leave-confirm-${t.id}" style="padding:4px 12px;background:#4CAF50;color:#fff;border:none;border-radius:4px;cursor:pointer">Leave</button>
          <button id="toast-leave-cancel-${t.id}" style="padding:4px 12px;background:#333;color:#fff;border:none;border-radius:4px;cursor:pointer">Stay</button>
        </div>
      </div>
    `, { duration: Infinity, id: 'leave-confirm' });

    const handler = (e) => {
      if (e.target.id && e.target.id.startsWith('toast-leave-confirm-')) {
        toast.dismiss('leave-confirm');
        document.removeEventListener('click', handler);
        leaveDungeon(sessionId, character.id);
        toast.success('✨ Healed to full HP!', { duration: 2000 });
        gameStore.leaveDungeon();
      } else if (e.target.id && e.target.id.startsWith('toast-leave-cancel-')) {
        toast.dismiss('leave-confirm');
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }

  function addLog(message) {
    combatLog = [...combatLog, { message, time: new Date() }];
    if (combatLog.length > 10) {
      combatLog = combatLog.slice(-10);
    }
  }

  // ── Grid helpers ──────────────────────────────────────────
  function classIconForClass(cls) {
    if (cls === 'warrior') return '🗡️';
    if (cls === 'mage') return '🔮';
    if (cls === 'rogue') return '🗡️';
    return '🧙';
  }

  function getCellContent(x, y) {
    if (playerPos.x === x && playerPos.y === y) {
      return { type: 'player', content: '🚶' };
    }

    // Other players in co-op
    for (const [, p] of otherPlayers) {
      if (p.position && p.position.x === x && p.position.y === y) {
        return { type: 'other-player', content: classIconForClass(p.class) };
      }
    }

    if (exitPoint && exitPoint.x === x && exitPoint.y === y) {
      return { type: 'exit', content: '🚪' };
    }

    const enemy = enemies.find(e => e.isAlive && e.position.x === x && e.position.y === y);
    if (enemy) {
      return { type: 'enemy', content: enemy.sprite, enemy };
    }

    if (maze[y][x] === 1) {
      return { type: 'wall', content: '🧱' };
    }

    return { type: 'floor', content: '' };
  }

  function handleCellClick(x, y, cell) {
    if (cell.type === 'enemy' && cell.enemy) {
      selectedEnemy = cell.enemy;
    }
  }

  function handleCellKeyDown(e, x, y, cell) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCellClick(x, y, cell);
    }
  }

  function isEnemyInRange(enemy) {
    if (!enemy) return false;
    const dx = Math.abs(enemy.position.x - playerPos.x);
    const dy = Math.abs(enemy.position.y - playerPos.y);
    return (dx === 0 && dy === 0) || (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
  }

  $: {
    if (selectedEnemy && !selectedEnemy.isAlive) {
      selectedEnemy = null;
    }
  }
</script>

<div class="dungeon-game">
  {#if !sessionId}
    <!-- ── Setup Screen ──────────────────────────────────── -->
    <div class="dungeon-setup">
      <h2>🏰 Enter the Dungeon</h2>

      <div class="character-info">
        <h3>{character.name} the {character.class}</h3>
        <div class="stats">
          <span>🎖️ Level {character.level || 1}</span>
          <span>❤️ {character.health}/{character.max_health}</span>
          <span title="Attack{equippedWeapon ? ` (+${equippedWeapon.effect_value} from ${equippedWeapon.name})` : ''}">
            ⚔️ {character.base_attack}{equippedWeapon ? ` +${equippedWeapon.effect_value}` : ''}
          </span>
          <span title="Defense{equippedArmor ? ` (+${equippedArmor.effect_value} from ${equippedArmor.name})` : ''}">
            🛡️ {character.base_defense}{equippedArmor ? ` +${equippedArmor.effect_value}` : ''}
          </span>
        </div>
        {#if character.experience !== undefined && character.requiredXP}
          <div class="xp-bar">
            <div class="xp-progress" style="width: {(character.experience / character.requiredXP) * 100}%"></div>
            <span class="xp-text">XP: {character.experience}/{character.requiredXP}</span>
          </div>
        {/if}
      </div>

      <div class="difficulty-selector">
        <label>
          Difficulty:
          <input type="range" min="1" max="5" bind:value={difficulty} />
          <span class="difficulty-value">Level {difficulty}</span>
        </label>
      </div>

      <button class="start-btn" on:click={handleStartDungeon}>
        ⚔️ Start Dungeon
      </button>

      <!-- Inventory preview on setup screen -->
      <div class="setup-inventory">
        <div class="inventory-header">
          <h4>🎒 Inventory</h4>
          {#if gold > 0}<span class="gold-display">🪙 {gold}</span>{/if}
        </div>
        {#if inventoryLoading}
          <p class="inv-empty">Loading...</p>
        {:else}
          {@const displayItems = inventory.filter(i => i.type !== 'gold')}
          {#if displayItems.length === 0}
            <p class="inv-empty">No items — kill enemies to find loot!</p>
          {:else}
            <div class="inv-list">
              {#each displayItems as inv (inv.id)}
                <div class="inv-item" class:inv-equipped={inv.equipped} class:inv-uncommon={inv.rarity === 'uncommon'}>
                  <span class="inv-icon">{inv.sprite_icon}</span>
                  <span class="inv-name">{inv.name}</span>
                  {#if inv.quantity > 1}<span class="inv-qty">×{inv.quantity}</span>{/if}
                  {#if inv.equipped}<span class="inv-badge">✓</span>{/if}
                  <div class="inv-actions">
                    {#if inv.type === 'weapon' || inv.type === 'armor'}
                      <button class="inv-btn equip-btn" on:click={() => handleEquipItem(inv)}>
                        {inv.equipped ? 'Unequip' : 'Equip'}
                      </button>
                    {/if}
                    <!-- Gift button (setup screen) -->
                    <button class="inv-btn gift-btn" on:click={() => toggleGiftForm(inv.id)} title="Gift item">🎁</button>
                    <button class="inv-btn drop-btn" on:click={() => handleDropItem(inv)} title="Drop">✕</button>
                  </div>
                </div>
                <!-- Gift form inline -->
                {#if giftOpenFor === inv.id}
                  <div class="gift-form">
                    <input
                      class="gift-input"
                      type="text"
                      placeholder="Recipient username…"
                      bind:value={giftUsername}
                      on:keydown={(e) => handleGiftKeydown(e, inv)}
                      maxlength="50"
                      disabled={giftSending}
                    />
                    <button class="inv-btn gift-send-btn" on:click={() => sendGift(inv)} disabled={giftSending || !giftUsername.trim()}>
                      {giftSending ? '⏳' : 'Send'}
                    </button>
                    <button class="inv-btn" on:click={() => { giftOpenFor = null; giftUsername = ''; }}>✕</button>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>

  {:else}
    <!-- ── Active Dungeon ─────────────────────────────────── -->
    <div class="game-container">
      <div class="game-header">
        <div class="character-stats">
          <h3>{character.name} - Level {character.level || 1}</h3>
          <div class="stat-bar">
            <span>❤️ {character.health}/{character.max_health}</span>
          </div>
          {#if character.experience !== undefined && character.requiredXP}
            <div class="xp-bar">
              <div class="xp-progress" style="width: {(character.experience / character.requiredXP) * 100}%"></div>
              <span class="xp-text">XP: {character.experience}/{character.requiredXP}</span>
            </div>
          {/if}
        </div>

        <!-- Session code display -->
        <div class="session-code-area">
          <span class="session-code-label">🔗 Code:</span>
          <code class="session-code-value">{sessionId}</code>
          <button class="copy-btn" on:click={copySessionCode} title="Copy session code">📋</button>
        </div>

        <button
          class="leave-btn"
          class:leave-btn-locked={aliveEnemies.length > 0}
          on:click={handleLeaveDungeon}
          title={aliveEnemies.length > 0 ? `${aliveEnemies.length} monsters remaining` : 'Leave dungeon'}
        >
          {aliveEnemies.length > 0 ? `🔒 ${aliveEnemies.length} left` : '🚪 Leave Dungeon'}
        </button>
      </div>

      <div class="game-area">
        <div class="dungeon-grid-container">
          {#key gridKey}
            <div class="dungeon-grid" style="grid-template-columns: repeat({maze[0].length}, 30px);">
              {#each maze as row, y}
                {#each row as cell, x}
                  {@const cellData = getCellContent(x, y)}
                  {#if cellData.type === 'enemy'}
                    <div
                      class="cell {cellData.type}"
                      class:selected={selectedEnemy && cellData.enemy === selectedEnemy}
                      role="button"
                      tabindex="0"
                      on:click={() => handleCellClick(x, y, cellData)}
                      on:keydown={(e) => handleCellKeyDown(e, x, y, cellData)}
                    >
                      {cellData.content}
                    </div>
                  {:else}
                    <div
                      class="cell {cellData.type}"
                    >
                      {cellData.content}
                    </div>
                  {/if}
                {/each}
              {/each}
            </div>
          {/key}
        </div>

        <div class="sidebar">
          <div class="controls">
            <h4>Controls</h4>
            <p>🎮 WASD or Arrow Keys to move</p>
            <p>🖱️ Click enemy to select</p>
            <p>⚔️ SPACE to attack</p>
            <p>🚪 Kill all monsters, then reach the exit!</p>
            <p>💀 Die = Heal & Return</p>
            {#if otherPlayers.size > 0}
              <p>👥 {otherPlayers.size} other player(s) in dungeon</p>
            {/if}
          </div>

          <div class="movement-pad">
            <h4>Movement</h4>
            {#if selectedEnemy && selectedEnemy.isAlive}
              <p class="combat-notice">⚔️ IN COMBAT!</p>
            {/if}
            <div class="dpad">
              <button
                class="dpad-btn up"
                class:disabled={selectedEnemy && selectedEnemy.isAlive}
                on:click={() => handleMoveButton('up')}
              >
                ⬆️
              </button>
              <div class="dpad-middle">
                <button
                  class="dpad-btn left"
                  class:disabled={selectedEnemy && selectedEnemy.isAlive}
                  on:click={() => handleMoveButton('left')}
                >
                  ⬅️
                </button>
                <div class="dpad-center"></div>
                <button
                  class="dpad-btn right"
                  class:disabled={selectedEnemy && selectedEnemy.isAlive}
                  on:click={() => handleMoveButton('right')}
                >
                  ➡️
                </button>
              </div>
              <button
                class="dpad-btn down"
                class:disabled={selectedEnemy && selectedEnemy.isAlive}
                on:click={() => handleMoveButton('down')}
              >
                ⬇️
              </button>
            </div>
          </div>

          {#if selectedEnemy && selectedEnemy.isAlive}
            {@const currentEnemy = enemies.find(e => e.id === selectedEnemy.id)}
            {#if currentEnemy && currentEnemy.isAlive}
              <div class="enemy-panel">
                <h4>Selected Enemy</h4>
                <div class="enemy-info">
                  <div class="enemy-name">{currentEnemy.sprite} {currentEnemy.name}</div>
                  <div class="enemy-health">
                    ❤️ {currentEnemy.health}/{currentEnemy.maxHealth}
                  </div>
                  {#if isEnemyInRange(currentEnemy)}
                    <button class="attack-btn" on:click={handleAttack}>
                      ⚔️ Attack
                    </button>
                  {:else}
                    <p class="out-of-range">Move closer to attack!</p>
                  {/if}
                </div>
              </div>
            {/if}
          {/if}

          <!-- ── Inventory Panel ── -->
          <div class="inventory-panel">
            <div class="inventory-header">
              <h4>🎒 Inventory</h4>
              {#if gold > 0}
                <span class="gold-display">🪙 {gold}</span>
              {/if}
            </div>

            {#if inventoryLoading}
              <p class="inv-empty">Loading...</p>
            {:else}
              {@const displayItems = inventory.filter(i => i.type !== 'gold')}
              {#if displayItems.length === 0}
                <p class="inv-empty">No items yet</p>
              {:else}
                <div class="inv-list">
                  {#each displayItems as inv (inv.id)}
                    <div class="inv-item" class:inv-equipped={inv.equipped} class:inv-uncommon={inv.rarity === 'uncommon'}>
                      <span class="inv-icon">{inv.sprite_icon}</span>
                      <span class="inv-name">{inv.name}</span>
                      {#if inv.quantity > 1}
                        <span class="inv-qty">×{inv.quantity}</span>
                      {/if}
                      {#if inv.equipped}
                        <span class="inv-badge">✓</span>
                      {/if}
                      <div class="inv-actions">
                        {#if inv.type === 'potion'}
                          <button class="inv-btn use-btn" on:click={() => handleUsePotion(inv)} title="Use potion (E)">Use</button>
                        {:else if inv.type === 'weapon' || inv.type === 'armor'}
                          <button class="inv-btn equip-btn" on:click={() => handleEquipItem(inv)}>
                            {inv.equipped ? 'Unequip' : 'Equip'}
                          </button>
                        {/if}
                        <!-- Gift button -->
                        <button class="inv-btn gift-btn" on:click={() => toggleGiftForm(inv.id)} title="Gift to another player">🎁</button>
                        <button class="inv-btn drop-btn" on:click={() => handleDropItem(inv)} title="Drop item">✕</button>
                      </div>
                    </div>
                    <!-- Gift inline form -->
                    {#if giftOpenFor === inv.id}
                      <div class="gift-form">
                        <input
                          class="gift-input"
                          type="text"
                          placeholder="Recipient username…"
                          bind:value={giftUsername}
                          on:keydown={(e) => handleGiftKeydown(e, inv)}
                          maxlength="50"
                          disabled={giftSending}
                        />
                        <button class="inv-btn gift-send-btn" on:click={() => sendGift(inv)} disabled={giftSending || !giftUsername.trim()}>
                          {giftSending ? '⏳' : 'Send'}
                        </button>
                        <button class="inv-btn" on:click={() => { giftOpenFor = null; giftUsername = ''; }}>✕</button>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            {/if}

            {#if sessionId}
              <p class="inv-hint">Press <kbd>E</kbd> to use a potion</p>
            {/if}
          </div>

          <div class="combat-log">
            <h4>Combat Log</h4>
            <div class="log-entries">
              {#each combatLog as entry}
                <div class="log-entry">{entry.message}</div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dungeon-game {
    padding: 1em;
  }

  .dungeon-setup {
    max-width: 500px;
    margin: 0 auto;
    padding: 2em;
    background-color: #1a1a1a;
    border-radius: 8px;
    text-align: center;
  }

  .character-info {
    margin: 1.5em 0;
    padding: 1em;
    background-color: #2a2a2a;
    border-radius: 8px;
  }

  .character-info h3 {
    color: #ffd700;
    margin-bottom: 0.5em;
    text-transform: capitalize;
  }

  .stats {
    display: flex;
    justify-content: center;
    gap: 1.5em;
    font-size: 1.1em;
  }

  .difficulty-selector {
    margin: 2em 0;
  }

  .difficulty-selector label {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .difficulty-selector input {
    width: 100%;
  }

  .difficulty-value {
    font-weight: bold;
    color: #ffd700;
  }

  .start-btn {
    padding: 1em 3em;
    font-size: 1.2em;
    background-color: #4CAF50;
    border-color: #4CAF50;
    margin-bottom: 1.5em;
  }

  .start-btn:hover {
    background-color: #45a049;
  }

  .setup-inventory {
    text-align: left;
    background: #2a2a2a;
    border-radius: 8px;
    padding: 1em;
    margin-top: 0.5em;
    max-height: 260px;
    overflow-y: auto;
  }

  .game-container {
    max-width: 1400px;
    margin: 0 auto;
  }

  .game-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1em;
    background-color: #1a1a1a;
    border-radius: 8px;
    margin-bottom: 1em;
    flex-wrap: wrap;
    gap: 0.5em;
  }

  .character-stats h3 {
    margin: 0 0 0.5em 0;
    color: #ffd700;
  }

  .stat-bar {
    font-size: 1.1em;
  }

  /* ── Session code ── */
  .session-code-area {
    display: flex;
    align-items: center;
    gap: 0.4em;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 8px;
    padding: 0.4em 0.7em;
    font-size: 0.85em;
  }

  .session-code-label {
    color: #aaa;
    white-space: nowrap;
  }

  .session-code-value {
    color: #ffd700;
    font-family: monospace;
    font-size: 0.9em;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1em;
    padding: 0 2px;
    line-height: 1;
    opacity: 0.8;
    transition: opacity 0.15s;
  }

  .copy-btn:hover {
    opacity: 1;
  }

  .xp-bar {
    position: relative;
    width: 100%;
    min-width: 200px;
    height: 32px;
    background-color: #333;
    border-radius: 16px;
    overflow: hidden;
    margin-top: 0.5em;
    border: 2px solid #555;
  }

  .xp-progress {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    transition: width 0.5s ease;
  }

  .xp-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.95em;
    font-weight: bold;
    color: white;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
    pointer-events: none;
    white-space: nowrap;
  }

  .leave-btn {
    background-color: #f44336;
    border-color: #f44336;
  }

  .leave-btn-locked {
    background-color: #555;
    border-color: #666;
    cursor: not-allowed;
    opacity: 0.7;
  }

  .leave-btn-locked:hover {
    background-color: #666;
  }

  .game-area {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 1em;
  }

  .dungeon-grid-container {
    background-color: #1a1a1a;
    padding: 1em;
    border-radius: 8px;
    overflow: auto;
    max-height: 70vh;
  }

  .dungeon-grid {
    display: grid;
    gap: 2px;
    margin: 0 auto;
    width: fit-content;
  }

  .cell {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    border-radius: 2px;
    cursor: pointer;
  }

  .cell[role="button"]:focus {
    outline: 2px solid #ffd700;
    outline-offset: 2px;
  }

  .cell.floor {
    background-color: #2a2a2a;
  }

  .cell.wall {
    background-color: #444;
  }

  .cell.player {
    background-color: #4CAF50;
  }

  /* Co-op other player */
  .cell.other-player {
    background-color: #1565C0;
  }

  .cell.enemy {
    background-color: #f44336;
  }

  .cell.enemy:hover {
    background-color: #ff5544;
  }

  .cell.exit {
    background-color: #4CAF50;
    animation: glow 1.5s ease-in-out infinite;
  }

  @keyframes glow {
    0%, 100% { box-shadow: 0 0 5px #4CAF50; }
    50% { box-shadow: 0 0 20px #4CAF50; }
  }

  .cell.selected {
    outline: 3px solid #ffd700;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 1em;
  }

  .controls, .movement-pad, .enemy-panel, .combat-log {
    background-color: #1a1a1a;
    padding: 1em;
    border-radius: 8px;
  }

  h4 {
    margin: 0 0 0.5em 0;
    color: #ffd700;
  }

  .controls p {
    margin: 0.5em 0;
    font-size: 0.9em;
  }

  .movement-pad {
    background-color: #1a1a1a;
    padding: 1em;
    border-radius: 8px;
  }

  .dpad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .dpad-middle {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .dpad-center {
    width: 60px;
    height: 60px;
    background-color: #2a2a2a;
    border-radius: 8px;
  }

  .dpad-btn {
    width: 60px;
    height: 60px;
    font-size: 24px;
    background-color: #4CAF50;
    border: 2px solid #45a049;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .dpad-btn:hover {
    background-color: #45a049;
    transform: scale(1.05);
  }

  .dpad-btn:active {
    transform: scale(0.95);
    background-color: #3d8b40;
  }

  .dpad-btn.disabled {
    opacity: 0.3;
    cursor: not-allowed;
    background-color: #666;
  }

  .dpad-btn.disabled:hover {
    background-color: #666;
    transform: none;
  }

  .combat-notice {
    color: #ff4444;
    font-weight: bold;
    text-align: center;
    margin: 0.5em 0;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .enemy-info {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .enemy-name {
    font-size: 1.1em;
    font-weight: bold;
  }

  .attack-btn {
    background-color: #f44336;
    border-color: #f44336;
    margin-top: 0.5em;
  }

  .out-of-range {
    color: #ff9800;
    font-style: italic;
  }

  /* ── Inventory Panel ── */
  .inventory-panel {
    background-color: #1a1a1a;
    padding: 1em;
    border-radius: 8px;
    max-height: 280px;
    overflow-y: auto;
  }

  .inventory-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5em;
  }

  .inventory-header h4 {
    margin: 0;
  }

  .gold-display {
    color: #ffd700;
    font-weight: bold;
    font-size: 0.95em;
  }

  .inv-empty {
    color: #666;
    font-size: 0.85em;
    text-align: center;
    margin: 0.5em 0;
  }

  .inv-hint {
    color: #666;
    font-size: 0.75em;
    text-align: center;
    margin: 0.5em 0 0 0;
  }

  kbd {
    background: #333;
    border: 1px solid #555;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 0.8em;
  }

  .inv-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .inv-item {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #2a2a2a;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.85em;
    transition: border-color 0.2s;
  }

  .inv-item.inv-equipped {
    border-color: #ffd700;
    background: #2a2a1a;
  }

  .inv-item.inv-uncommon {
    border-color: #9b59b6;
  }

  .inv-item.inv-equipped.inv-uncommon {
    border-color: #ffd700;
  }

  .inv-icon { font-size: 1.1em; }

  .inv-name {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .inv-qty {
    color: #aaa;
    font-size: 0.85em;
  }

  .inv-badge {
    color: #ffd700;
    font-size: 0.8em;
    font-weight: bold;
  }

  .inv-actions {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
  }

  .inv-btn {
    padding: 2px 6px;
    font-size: 0.75em;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid transparent;
    line-height: 1.4;
  }

  .use-btn {
    background: #4CAF50;
    color: #fff;
    border-color: #45a049;
  }

  .use-btn:hover { background: #45a049; }

  .equip-btn {
    background: #646cff;
    color: #fff;
    border-color: #5555dd;
  }

  .equip-btn:hover { background: #5555dd; }

  /* Gift button */
  .gift-btn {
    background: transparent;
    color: #ccc;
    border-color: #444;
    padding: 2px 4px;
  }

  .gift-btn:hover {
    background: #2a2a1a;
    border-color: #ffd700;
  }

  /* Gift inline form */
  .gift-form {
    display: flex;
    gap: 4px;
    padding: 4px 6px 4px 26px;
    background: #222230;
    border-radius: 0 0 4px 4px;
    margin-top: -4px;
    border: 1px solid #44446a;
    border-top: none;
  }

  .gift-input {
    flex: 1;
    background: #2a2a3a;
    border: 1px solid #44446a;
    border-radius: 4px;
    color: #e0e0e0;
    font-size: 0.78em;
    padding: 2px 6px;
    outline: none;
  }

  .gift-input:focus {
    border-color: #ffd700;
  }

  .gift-send-btn {
    background: #ffd700;
    color: #111;
    border-color: #ccaa00;
    font-weight: bold;
  }

  .gift-send-btn:hover:not(:disabled) {
    background: #ffec6e;
  }

  .gift-send-btn:disabled {
    background: #333;
    color: #666;
    border-color: #333;
    cursor: not-allowed;
  }

  .drop-btn {
    background: transparent;
    color: #888;
    border-color: #444;
  }

  .drop-btn:hover {
    background: #f44336;
    color: #fff;
    border-color: #f44336;
  }

  .combat-log {
    flex: 1;
    max-height: 300px;
    overflow-y: auto;
  }

  .log-entries {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
  }

  .log-entry {
    font-size: 0.9em;
    padding: 0.25em;
    background-color: #2a2a2a;
    border-radius: 4px;
  }
</style>
