
import { ScriptParser } from './pulse-v5/src/server/script-parser';

const parser = new ScriptParser();
const script = `
  import Navbar from '../../components/Navbar.pulse';

  const [name, setName] = createSignal('Pulse User');
  const [email, setEmail] = createSignal('');
  const [role, setRole] = createSignal('developer');
  const [notifications, setNotifications] = createSignal(true);
  const [theme, setTheme] = createSignal('light');

  function handleNameInput(e) {
    setName(e.target.value);
  }

  function handleEmailInput(e) {
    setEmail(e.target.value);
  }

  function handleRoleChange(e) {
    setRole(e.target.value);
  }

  function toggleNotifications(e) {
    setNotifications(e.target.checked);
  }

  function handleThemeChange(e) {
    setTheme(e.target.value);
  }

  function handleSubmit(e) {
    e.preventDefault();
    console.log('Form Submitted:', {
      name: name(),
      email: email(),
      role: role(),
      notifications: notifications(),
      theme: theme()
    });
    alert('Form Submitted! Check console for data.');
  }
`;

const result = parser.parse(script);
console.log('State Vars:', JSON.stringify(result.stateVars, null, 2));
console.log('Functions:', result.functions.map(f => f.name));
