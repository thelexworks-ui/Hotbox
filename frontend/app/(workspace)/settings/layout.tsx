import { SettingsSidebar } from '@/components/settings/SettingsSidebar';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0">
      <SettingsSidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
