import { useWidgetSetting } from '@overline-zebar/config';
import {
  FieldDescription,
  FieldInput,
  FieldTitle,
  FormField,
  Input,
} from '@overline-zebar/ui';

function TogglTab() {
  const [togglApiKey, setTogglApiKey] = useWidgetSetting('main', 'togglApiKey');

  return (
    <FormField>
      <FieldTitle>Toggl API Token</FieldTitle>
      <FieldInput>
        <Input
          placeholder="••••••••••••••••••••••••••••••••"
          value={togglApiKey}
          onChange={(e) => setTogglApiKey(e.target.value)}
          type="password"
          autoComplete="off"
        />
      </FieldInput>
      <FieldDescription>
        Found in Toggl Track → Profile settings → API Token. The topbar
        polls your current timer every 2 minutes once saved.
      </FieldDescription>
    </FormField>
  );
}

export default TogglTab;
