import os

filepath = r'c:\Users\Igor\Documents\GitHub\Ecoquanta2\src\components\CoordenacaoEngenharia\Contrato.tsx'

with open(filepath, 'rb') as f:
    data = f.read()

text = data.decode('utf-8')
# Normalize all line endings to \n
text = text.replace('\r\n', '\n').replace('\r', '\n')
lines = text.split('\n')

# The first 21 lines (0-20) are the broken duplicated import block
# Replace them with the correct single import block (15 lines)
new_header = [
    "import React, { useDeferredValue, useMemo, useState } from 'react';",
    "import {",
    "  AlertTriangle,",
    "  Building2,",
    "  CalendarDays,",
    "  CheckCircle2,",
    "  ClipboardList,",
    "  FileWarning,",
    "  GitBranch,",
    "  MessageSquareText,",
    "  PencilLine,",
    "  Plus,",
    "  Route,",
    "  X",
    "} from 'lucide-react';",
]

# lines[21] onwards is the rest of the file (starting with "import type { AuthUser }...")
new_lines = new_header + lines[20:]

result = '\n'.join(new_lines)

with open(filepath, 'wb') as f:
    f.write(result.encode('utf-8'))

print(f'Done. Old lines: {len(lines)}, New lines: {len(new_lines)}')
print(f'First 5 new lines:')
for i, line in enumerate(new_lines[:5]):
    print(f'  {i+1}: {line}')
