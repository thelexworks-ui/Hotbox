import { cookies } from 'next/headers';
import { ChannelView } from '@/components/hotbox/ChannelView';

interface Props {
  params: { memberId: string };
}

// DM channel convention: dm-{initiator-slug}-{agent-slug}
// Read the logged-in user's slug from the hotbox-member-id session cookie so the
// channel ID is scoped per user, not shared across all users messaging the same agent.
export default function DmPage({ params }: Props) {
  const cookieStore = cookies();
  const userSlug = cookieStore.get('hotbox-member-id')?.value ?? 'user';
  const channelId = `dm-${userSlug}-${params.memberId}`;
  return <ChannelView channelId={channelId} isDm />;
}
