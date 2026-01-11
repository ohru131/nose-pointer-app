import { MainSelectionScreen } from '@/components/MainSelectionScreen';
import { DetailScreen } from '@/components/DetailScreen';
import { useState } from 'react';

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState<'want' | 'help' | 'chat' | null>(null);

  const handleSelect = (category: 'want' | 'help' | 'chat') => {
    setSelectedCategory(category);
    console.log('Selected category:', category);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  return (
    <div className="min-h-screen">
      {selectedCategory ? (
        <DetailScreen category={selectedCategory} onBack={handleBack} />
      ) : (
        <MainSelectionScreen onSelect={handleSelect} />
      )}
    </div>
  );
}
