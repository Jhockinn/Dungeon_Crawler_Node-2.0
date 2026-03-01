<script>
  import { createEventDispatcher } from 'svelte';
  import { register } from '../../services/api';
  import toast from 'svelte-french-toast';

  const dispatch = createEventDispatcher();

  let username = '';
  let email = '';
  let password = '';
  let confirmPassword = '';
  let gdprConsent = false;
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

    if (!gdprConsent) {
      toast.error('You must accept the privacy policy to register');
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

    <div class="form-group gdpr">
      <label class="gdpr-label">
        <input
          type="checkbox"
          bind:checked={gdprConsent}
          disabled={loading}
        />
        I agree that my username and email are stored to provide the service, in accordance with GDPR.
      </label>
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

  .gdpr {
    margin-top: 0.5em;
  }

  .gdpr-label {
    display: flex;
    align-items: flex-start;
    gap: 0.5em;
    font-size: 0.85em;
    color: #aaa;
    cursor: pointer;
  }

  .gdpr-label input {
    width: auto;
    margin-top: 2px;
    flex-shrink: 0;
  }
</style>
