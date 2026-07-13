import { ChannelView } from '@/components/hotbox/ChannelView';

interface Props {
  params: { channelId: string };
}

export default function ChannelPage({ params }: Props) {
  return <ChannelView channelId={params.channelId} />;
}
