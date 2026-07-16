import { cookies } from 'next/headers';
import { ChannelView } from '@/components/hotbox/ChannelView';
import { createChannel } from '@/lib/hotbox/channel-service';
import { verifyAccessToken } from '@/lib/fusion/auth';

const DEFAULT_ORG = process.env.HOTBOX_ORG ?? 'toadsage';

interface Props {
  params: { memberId: string };
}

export default async function DmPage({ params }: Props) {
  const cookieStore = cookies();

  // Resolve userSlug: prefer JWT member_id, fall back to legacy cookie
  let userSlug = 'user';
  const accessCookie = cookieStore.get('hx_access');
  if (accessCookie?.value) {
    try {
      const claims = await verifyAccessToken(accessCookie.value);
      if (claims.member_id) userSlug = claims.member_id;
    } catch { /* expired — fall through */ }
  }
  if (userSlug === 'user') {
    userSlug = cookieStore.get('hotbox-member-id')?.value ?? 'user';
  }

  const channelId = `dm-${userSlug}-${params.memberId}`;

  // Ensure DM channel + CK + members exist before ChannelView renders.
  // createChannel() is idempotent — returns existing on race.
  await createChannel({
    org: DEFAULT_ORG,
    name: channelId,
    type: 'dm',
    members: [userSlug, params.memberId],
  });

  return <ChannelView channelId={channelId} isDm />;
}
