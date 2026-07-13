import { ChannelView } from '@/components/hotbox/ChannelView';

interface Props {
  params: { memberId: string };
}

export default function DmPage({ params }: Props) {
  return <ChannelView channelId={`dm-${params.memberId}`} isDm />;
}
