# The tractor's teal-painted triangles (its cab glass) moved to their own primitive with a see-through material.
import json,struct,sys
import numpy as np
src,dst,maskf=sys.argv[1:4]
b=open(src,'rb').read()
jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin_=bytearray(b[20+jl+8:20+jl+8+struct.unpack('<I',b[20+jl:20+jl+4])[0]])
a=j['accessors'][3]; bv=j['bufferViews'][a['bufferView']]; off=bv.get('byteOffset',0)+a.get('byteOffset',0)
idx=np.frombuffer(bytes(bin_),dtype=np.uint16,count=a['count'],offset=off).reshape(-1,3)
mask=np.load(maskf)
body=idx[~mask].astype(np.uint16).tobytes(); glass=idx[mask].astype(np.uint16).tobytes()
def add(data):
    while len(bin_)%4: bin_.append(0)
    o=len(bin_); bin_.extend(data)
    j['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':len(data),'target':34963})
    return len(j['bufferViews'])-1
for data in (body,glass):
    v=add(data); j['accessors'].append({'bufferView':v,'componentType':5123,'count':len(data)//2,'type':'SCALAR'})
# Turned a quarter: its front (+Z) to -X, as the old model stood (render/tractor.ts BIG).
for ai in (0,1):
    a=j['accessors'][ai]; bv=j['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    v=np.frombuffer(bytes(bin_[o:o+a['count']*12]),dtype=np.float32).reshape(-1,3).copy()
    x=v[:,0].copy(); v[:,0]=-v[:,2]; v[:,2]=x
    bin_[o:o+a['count']*12]=v.astype(np.float32).tobytes()
    if 'min' in a: a['min']=v.min(0).tolist(); a['max']=v.max(0).tolist()
nb=len(j['accessors'])-2
prim=j['meshes'][0]['primitives'][0]
prim['indices']=nb
gp=dict(prim); gp['indices']=nb+1; gp['material']=1
j['meshes'][0]['primitives']=[prim,gp]
j['materials'].append({'name':'cam','alphaMode':'BLEND','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[0.72,0.88,0.92,0.28],'metallicFactor':0.1,'roughnessFactor':0.08}})
while len(bin_)%4: bin_.append(0)
j['buffers'][0]['byteLength']=len(bin_)
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
out=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bin_),0x004E4942)+bytes(bin_)
open(dst,'wb').write(out)
print('body',len(body)//6,'glass',len(glass)//6)
