import os, sys, filecmp

EX = {'node_modules', '.git', 'dist', '.astro', '.claude'}

def files(root):
    out = set()
    for d, dirs, fs in os.walk(root):
        dirs[:] = [x for x in dirs if x not in EX]
        for f in fs:
            out.add(os.path.relpath(os.path.join(d, f), root))
    return out

T = sys.argv[1] if len(sys.argv) > 1 else '.'
S = sys.argv[2]
t, s = files(T), files(S)
both = t & s
ident = [f for f in sorted(both)
         if filecmp.cmp(os.path.join(T, f), os.path.join(S, f), shallow=False)]

print('ficheros theme :', len(t))
print('ficheros site  :', len(s))
print('en ambos       :', len(both))
print('  identicos    :', len(ident))
print('  difieren     :', len(both) - len(ident))
print('solo en theme  :', len(t - s))
print('solo en site   :', len(s - t))
print()
print('--- los identicos ---')
for f in ident:
    print(' ', f)
