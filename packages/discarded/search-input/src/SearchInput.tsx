import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@cartridge-engine/text-input';
import { useKeyboard } from 'ink-cartridge';

interface SearchInputProps {
  focusId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: (value: string) => void;
}

export function SearchInput({
  focusId,
  value,
  onChange,
  placeholder,
  onSubmit,
}: SearchInputProps) {
  const { boundKeyboard, focusUnregister } = useKeyboard();

  useEffect(() => {
    const unEsc = boundKeyboard(['escape'], () => onChange(''), { focusId });
    return () => {
      unEsc();
      focusUnregister(focusId);
    };
  }, [focusId, onChange, boundKeyboard, focusUnregister]);

  return (
    <Box>
      <Text color="blue">Search </Text>
      <TextInput
        focusId={focusId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onSubmit={onSubmit}
      />
      {value ? <Text color="grey"> ╳</Text> : null}
    </Box>
  );
}
