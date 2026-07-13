import { ThreadPanel } from '@/components/hotbox/ThreadPanel';

interface Props {
  params: { channelId: string; messageId: string };
}

export default function ThreadPage({ params }: Props) {
  return <ThreadPanel channelId={params.channelId} messageId={params.messageId} />;
}
