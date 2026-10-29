import json,struct,io,colorsys,sys
import numpy as np
from PIL import Image
p=r'C:/Users/hkocak/Downloads/blue tractor 3d model.glb'
b=open(p,'rb').read()
jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); bin_=b[20+jl+8:]
def acc(i,dt,n):
    a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; off=bv.get('byteOffset',0)+a.get('byteOffset',0)
    return np.frombuffer(bin_,dtype=dt,count=a['count']*n,offset=off).reshape(a['count'],n) if n>1 else np.frombuffer(bin_,dtype=dt,count=a['count'],offset=off)
pos=acc(0,np.float32,3); uv=acc(2,np.float32,2); idx=acc(3,np.uint16,1).reshape(-1,3)
tex=np.asarray(Image.open('test-output/trk/tex1.png').convert('RGB')).astype(np.float32)/255
H,W,_=tex.shape
def sample(u,v):
    x=np.clip((u%1)*W,0,W-1).astype(int); y=np.clip((v%1)*H,0,H-1).astype(int)
    return tex[y,x]
c=uv[idx].mean(axis=1)
col=sample(c[:,0],c[:,1])
r,g,bb=col[:,0],col[:,1],col[:,2]
mx=col.max(1); mn=col.min(1); s=(mx-mn)/np.maximum(mx,1e-6)
h=np.zeros(len(col))
for i,(R,G,B) in enumerate(col): h[i]=colorsys.rgb_to_hsv(R,G,B)[0]*360
teal=(h>155)&(h<200)&(s>0.2)&(mx>0.22)
cen=pos[idx].mean(axis=1)
print('tris',len(idx),'teal',teal.sum())
t=cen[teal]
print('teal y range',t[:,1].min(),t[:,1].max())
# histogram by y
for y0 in np.arange(0,0.56,0.04):
    m=(cen[:,1]>=y0)&(cen[:,1]<y0+0.04)
    print(f'{y0:.2f}', m.sum(), (m&teal).sum())
np.save('test-output/trk/teal.npy',teal)
# --- the panes only: teal on the cab's outer shell (near its sides, front or back), standing upright
nrm_a=j['accessors'][1]; bvn=j['bufferViews'][nrm_a['bufferView']]
nrm=np.frombuffer(bin_,dtype=np.float32,count=nrm_a['count']*3,offset=bvn.get('byteOffset',0)+nrm_a.get('byteOffset',0)).reshape(-1,3)
fn=nrm[idx].mean(axis=1); fn/=np.linalg.norm(fn,axis=1,keepdims=True)+1e-9
cab=teal&(cen[:,1]>0.26)
xs=cen[cab,0]; zs=cen[cab,2]
x0,x1=np.percentile(xs,1),np.percentile(xs,99); z0,z1=np.percentile(zs,1),np.percentile(zs,99)
print('cab x',x0,x1,'z',z0,z1)
TOL=float(sys.argv[1]) if len(sys.argv)>1 else 0.03
edge=(cen[:,0]<x0+TOL)|(cen[:,0]>x1-TOL)|(cen[:,2]<z0+TOL)|(cen[:,2]>z1-TOL)
pane=(teal&(cen[:,1]>0.2)&edge&(np.abs(fn[:,1])<0.6))|(teal&(cen[:,1]>0.41))
print('panes',pane.sum())
np.save('test-output/trk/pane.npy',pane)
