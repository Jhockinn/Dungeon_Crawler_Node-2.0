<script>
  import { createEventDispatcher } from 'svelte';
  import { register } from '../../services/api';
  import toast from 'svelte-french-toast';

  const dispatch = createEventDispatcher();

  let username = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let loading = false;

  async function handleRegister() {
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    loading = true;

    try {
      await register(username, email, password);
      dispatch('success');
    } catch (err) {
      toast.error(err.message);
    } finally {
      loading = false;
    }
  }
</script>

<div class="register-container">
  <h2>Register</h2>
  
  <form on:submit|preventDefault={handleRegister}>
    <div class="form-group">
      <label for="username">Username:</label>
      <input 
        type="text" 
        id="username" 
        bind:value={username} 
        required 
        disabled={loading}
      />
    </div>

    <div class="form-group">
      <label for="email">Email:</label>
      <input 
        type="email" 
        id="email" 
        bind:value={email} 
        required 
        disabled={loading}
      />
    </div>

    <div class="form-group">
      <label for="password">Password:</label>
      <input 
        type="password" 
        id="password" 
        bind:value={password} 
        required 
        disabled={loading}
      />
    </div>

    <div class="form-group">
      <label for="confirmPassword">Confirm Password:</label>
      <input 
        type="password" 
        id="confirmPassword" 
        bind:value={confirmPassword} 
        required 
        disabled={loading}
      />
    </div>

    <button type="submit" disabled={loading}>
      {loading ? 'Registering...' : 'Register'}
    </button>
  </form>
</div>

<style>
  .register-container {
    max-width: 400px;
    margin: 0 auto;
    padding: 2em;
    background-color: #1a1a1a;
    border-radius: 8px;
  }

  .form-group {
    margin-bottom: 1em;
    text-align: left;
  }

  label {
    display: block;
    margin-bottom: 0.5em;
  }

  input {
    width: 100%;
  }

  button {
    width: 100%;
  }
</style>
