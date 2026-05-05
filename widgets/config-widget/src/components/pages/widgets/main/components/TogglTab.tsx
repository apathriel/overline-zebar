import { useWidgetSetting } from '@overline-zebar/config';
import {
  FieldDescription,
  FieldInput,
  FieldTitle,
  FormField,
  Input,
} from '@overline-zebar/ui';
import { Separator } from '@/components/common/Separator';

function TogglTab() {
  const [togglEmail, setTogglEmail] = useWidgetSetting('main', 'togglEmail');
  const [togglApiKey, setTogglApiKey] = useWidgetSetting('main', 'togglApiKey');

  return (
    <>
      <FormField>
        <FieldTitle>Toggl Email</FieldTitle>
        <FieldInput>
          <Input
            placeholder="you@example.com"
            value={togglEmail}
            onChange={(e) => setTogglEmail(e.target.value)}
            type="email"
            autoComplete="off"
          />
        </FieldInput>
        <FieldDescription>
          The email address associated with your Toggl account.
        </FieldDescription>
      </FormField>
      <Separator />
      <FormField>
        <FieldTitle>Toggl API Key</FieldTitle>
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
          Found in Toggl Track → Profile → API Token. The topbar widget polls
          your current timer every 30 seconds once credentials are saved.
        </FieldDescription>
      </FormField>
    </>
  );
}

export default TogglTab;
