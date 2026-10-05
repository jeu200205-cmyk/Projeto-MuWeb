#include <cstdio>
typedef float vec3_t[3];
#define PBG_ADD_NEWCHAR_MONK_ITEM
#define MAX_ITEM_INDEX 512
#define MODEL_ITEM 0
#define Vector(a,b,c,out) do {out[0]=(a);out[1]=(b);out[2]=(c);} while(0)
const int MODEL_SWORD=0;
const int MODEL_AXE=512;
const int MODEL_MACE=1024;
const int MODEL_SPEAR=1536;
const int MODEL_BOW=2048;
const int MODEL_STAFF=2560;
const int MODEL_SHIELD=3072;
const int MODEL_HELM=3584;
const int MODEL_ARMOR=4096;
const int MODEL_PANTS=4608;
const int MODEL_GLOVES=5120;
const int MODEL_BOOTS=5632;
const int MODEL_WING=6144;
const int MODEL_HELPER=6656;
const int MODEL_POTION=7168;
const int MODEL_MONSTER01=30000, MODEL_ARMORINVEN_60=40000, MODEL_ARMORINVEN_61=40001, MODEL_ARMORINVEN_62=40002;
struct Monk {int EqualItemModelType(int t){return t;}} g_CMonkSystem;
void PartObjectColor(int Type,float Alpha,float Bright,vec3_t Light,bool ExtraMon)
{
	int Color = 0;
	
	if(ExtraMon && ( Type==MODEL_MONSTER01+27 || Type==MODEL_SPEAR+9))
	{
		Color = 8;
	}
	else if(Type==MODEL_MONSTER01+27 || Type==MODEL_SPEAR+9)
	{
		Color = 1;
	}
	else if(Type==MODEL_MONSTER01+35 || Type==MODEL_BOW+5 || Type==MODEL_BOW+13)
	{
		Color = 5;
	}
	else if(Type==MODEL_SWORD+14 || Type==MODEL_STAFF+5 || ( Type>=MODEL_POTION+25 && Type<MODEL_POTION+27 ) )
	{
		Color = 2;
	}
    else if(Type==MODEL_BOW+17 || Type==MODEL_BOW+19)
    {
        Color = 9;
    }
    else if( Type==MODEL_WING+14 )
    {
        Color = 2;
    }
	else if( Type==MODEL_BOW+18 )
	{
		Color = 10;
	}
    else if ( Type==MODEL_STAFF+9 )
    {
        Color = 5;
    }
	else if ( Type==MODEL_SWORD+31 )	
	{
		Color = 10;
	}
	else if ( Type==MODEL_SHIELD+16 )
	{
		Color = 6;
	}
	else if ( Type==MODEL_SPEAR+10 )
	{
		Color = 9;
	}
	else if ( Type==MODEL_MACE+8 )
	{
		Color = 9;
	}
	else if ( Type==MODEL_MACE+9 )
	{
		Color = 10;
	}
	else if ( Type==MODEL_MACE+10 )
	{
		Color = 12;
	}
	else if(Type == MODEL_SWORD+20)
	{
		Color = 10;
	}
	else if(Type == MODEL_SWORD+21)
	{
		Color = 5;
	}
	else if(Type == MODEL_BOW+20)
	{
		Color = 16;
	}
	else if(Type == MODEL_STAFF+11)
	{
		Color = 17;
	}
	else if ( Type==MODEL_MACE+12 )
    {
		Color = 16;
    }
	else if(Type == MODEL_SWORD+22)
	{
		Color = 18;
	}
	else if(Type == MODEL_STAFF+12)
	{
		Color = 19;
	}
	else if(Type == MODEL_BOW+21)
	{
		Color = 20;
	}
	else if(Type == MODEL_SWORD+23)
	{
		Color = 23;
	}
	else if(Type == MODEL_MACE+14)
	{
		Color = 22;
	}
	else if(Type == MODEL_SWORD+24)
	{
		Color = 24;
	}
	else if(Type == MODEL_STAFF+13)
	{
		Color = 25;
	}
	else if(Type == MODEL_BOW+22)
	{
		Color = 26;
	}
	else if(Type == MODEL_MACE+15)
	{
		Color = 28;
	}
	else if(Type == MODEL_SWORD+25)
	{
		Color = 27;
	}
	else if (Type == MODEL_STAFF+14)
		Color = 24;
	else if (Type == MODEL_STAFF+15)
		Color = 15;
	else if (Type == MODEL_STAFF+16)
		Color = 1;
	else if (Type == MODEL_STAFF+17)
		Color = 3;
	else if (Type == MODEL_STAFF+18)
		Color = 30;
	else if (Type == MODEL_STAFF+19)
		Color = 21;
	else if (Type == MODEL_STAFF+20)
		Color = 5;
	else if (Type == MODEL_STAFF+22)
		Color = 1;
	else if( Type == MODEL_SWORD+28 )
		Color = 8;
	else if( Type == MODEL_STAFF+30 )
		Color = 1;
	else if( Type == MODEL_STAFF+31 )
		Color = 19;
	else if( Type == MODEL_MACE+17 )
		Color = 40;
	else if( Type == MODEL_SHIELD+19 )
		Color = 29;
	else if( Type == MODEL_BOW+23 )	
		Color = 35;
	else if( Type == MODEL_SHIELD+20 )
		Color = 36;
 	else if(Type == MODEL_SHIELD+21)
 		Color = 30;
	else if(Type == MODEL_SPEAR+11)	
		Color = 20;
	else if(Type == MODEL_STAFF+33)
		Color = 43;
	else if(Type == MODEL_STAFF+34)
		Color = 5;
	else if(Type == MODEL_MACE+18)
		Color = 5;
	else if(Type == MODEL_BOW+24)
		Color = 36;
#ifdef PBG_ADD_NEWCHAR_MONK_ITEM
	else if(g_CMonkSystem.EqualItemModelType(Type) == MODEL_SWORD+32)
		Color = 16;
	else if(g_CMonkSystem.EqualItemModelType(Type) == MODEL_SWORD+33)
		Color = 42;
	else if(g_CMonkSystem.EqualItemModelType(Type) == MODEL_SWORD+34)
		Color = 18;
	else if(Type == MODEL_ARMORINVEN_60)
		Color = 16;
	else if(Type == MODEL_ARMORINVEN_61)
		Color = 42;
	else if(Type == MODEL_ARMORINVEN_62)
		Color = 18;
#endif //PBG_ADD_NEWCHAR_MONK_ITEM
	else//  if ( Type<MODEL_WING )
	{
		int ItemType = Type-MODEL_ITEM;
		if(ItemType/MAX_ITEM_INDEX>=7 && ItemType/MAX_ITEM_INDEX<=11)
		{
			switch(ItemType%MAX_ITEM_INDEX)
			{
			case 1 :Color=1;break;
			case 9 :Color=2;break;
			case 12:Color=2;break;
			case 3 :Color=3;break;
			case 13:Color=4;break;
			case 4 :Color=5;break;
			case 14:Color=5;break;
			case 6 :Color=6;break;
			case 15:Color=7;break;
            case 16:Color=10;break;
            case 17:Color=9;break;
            case 18:Color=5;break;
            case 19:Color=9;break;
            case 20:Color=9;break;
			case 21:Color=16;break;
			case 22:Color=17;break;
            case 23:Color=11;break;
			case 24:Color=16;break;
            case 25:Color=11;break;
            case 26:Color=12;break;
            case 27:Color=10;break;
            case 28:Color=15;break;
			case 29:Color=18;break;
			case 30:Color=19;break;
			case 31:Color=20;break;
			case 32:Color=21;break;
			case 33:Color=22;break;
			case 34:Color=24;break;				
			case 35:Color=25;break;
			case 36:Color=26;break;
			case 37:Color=27;break;	
			case 38:Color=28;break;
			case 39:Color=29;break;
			case 40:Color=30;break;
			case 41:Color=31;break;
			case 42:Color=32;break;
			case 43:Color=33;break;
			case 44:Color=34;break;
			case 45:Color=36;break;
			case 46:Color=42;break;
			case 47:Color=37;break;
			case 48:Color=1;break;
			case 49:Color=35;break;
			case 50:Color=39;break;
			case 51:Color=40;break;	
			case 52:Color=36;break;
			case 53:Color=41;break;
#ifdef PBG_ADD_NEWCHAR_MONK_ITEM
			case 59:Color=16;break;
			case 60:Color=42;break;
			case 61:Color=18;break;
#endif //PBG_ADD_NEWCHAR_MONK_ITEM
			}
		}
	}
	Bright *= Alpha;
	switch(Color)
	{
	case 0:Vector(Bright*1.0f,Bright*0.5f,Bright*0.0f,Light);break;
	case 1:Vector(Bright*1.0f,Bright*0.2f,Bright*0.0f,Light);break;
	case 2:Vector(Bright*0.0f,Bright*0.5f,Bright*1.0f,Light);break;
	case 3:Vector(Bright*0.0f,Bright*0.5f,Bright*1.0f,Light);break;
	case 4:Vector(Bright*0.0f,Bright*0.8f,Bright*0.4f,Light);break;
	case 5:Vector(Bright*1.0f,Bright*1.0f,Bright*1.0f,Light);break;
	case 6:Vector(Bright*0.6f,Bright*0.8f,Bright*0.4f,Light);break;
	case 7:Vector(Bright*0.9f,Bright*0.8f,Bright*1.0f,Light);break;
	case 8:Vector(Bright*0.8f,Bright*0.8f,Bright*1.0f,Light);break;
    case 9:Vector(Bright*0.5f,Bright*0.5f,Bright*0.8f,Light);break;
    case 10:Vector(Bright*0.75f,Bright*0.65f,Bright*0.5f,Light);break;
	case 11:Vector(Bright*0.35f,Bright*0.35f,Bright*0.6f,Light);break;
	case 12:Vector(Bright*0.47f,Bright*0.67f,Bright*0.6f,Light);break;
	case 13:Vector(Bright*0.0f,Bright*0.3f,Bright*0.6f,Light);break;
	case 14:Vector(Bright*0.65f,Bright*0.65f,Bright*0.55f,Light);break;
    case 15:Vector(Bright*0.2f,Bright*0.3f,Bright*0.6f,Light);break;
	case 16:Vector(Bright*0.8f,Bright*0.46f,Bright*0.25f,Light);break;
    case 17:Vector(Bright*0.65f,Bright*0.45f,Bright*0.3f,Light);break;
    case 18:Vector(Bright*0.5f,Bright*0.4f,Bright*0.3f,Light);break;
    case 19:Vector(Bright*0.37f,Bright*0.37f,Bright*1.0f,Light);break;
    case 20:Vector(Bright*0.3f,Bright*0.7f,Bright*0.3f,Light);break;
    case 21:Vector(Bright*0.5f,Bright*0.4f,Bright*1.0f,Light);break;
    case 22:Vector(Bright*0.45f,Bright*0.45f,Bright*0.23f,Light);break;
    case 23:Vector(Bright*0.3f,Bright*0.3f,Bright*0.45f,Light);break;
	case 24:Vector(Bright*0.6f,Bright*0.5f,Bright*0.2f,Light);break;
    case 25:Vector(Bright*0.6f,Bright*0.6f,Bright*0.6f,Light);break;
    case 26:Vector(Bright*0.3f,Bright*0.7f,Bright*0.3f,Light);break;
    case 27:Vector(Bright*0.5f,Bright*0.6f,Bright*0.7f,Light);break;
    case 28:Vector(Bright*0.45f,Bright*0.45f,Bright*0.23f,Light);break;
	case 29:Vector(Bright*0.2f,Bright*0.7f,Bright*0.3f,Light);break;
	case 30:Vector(Bright*0.7f,Bright*0.3f,Bright*0.3f,Light);break;
	case 31:Vector(Bright*0.7f,Bright*0.5f,Bright*0.3f,Light);break;
	case 32:Vector(Bright*0.5f,Bright*0.2f,Bright*0.7f,Light);break;
	case 33:Vector(Bright*0.8f,Bright*0.4f,Bright*0.6f,Light);break;
	case 34:Vector(Bright*0.6f,Bright*0.4f,Bright*0.8f,Light);break;
	case 35:Vector(Bright*0.7f,Bright*0.4f,Bright*0.4f,Light);break;
	case 36:Vector(Bright*0.5f,Bright*0.5f,Bright*0.7f,Light);break;
	case 37:Vector(Bright*0.7f,Bright*0.5f,Bright*0.7f,Light);break;
	case 38:Vector(Bright*0.2f,Bright*0.4f,Bright*0.7f,Light);break;
	case 39:Vector(Bright*0.3f,Bright*0.6f,Bright*0.4f,Light);break;
	case 40:Vector(Bright*0.7f,Bright*0.2f,Bright*0.2f,Light);break;
	case 41:Vector(Bright*0.7f,Bright*0.2f,Bright*0.7f,Light);break;
	case 42:Vector(Bright*0.8f,Bright*0.4f,Bright*0.0f,Light);break;
	case 43:Vector(Bright*0.8f,Bright*0.6f,Bright*0.2f,Light);break;
	}
}

void PartObjectColor2(int Type,float Alpha,float Bright,vec3_t Light,bool ExtraMon)
{
	int Color = 0;
	if(Type==MODEL_BOW+5 || Type==MODEL_BOW+13)
	{
		Color = 2;
	}
	else if(Type==MODEL_SWORD+14 || Type==MODEL_STAFF+5)
	{
		Color = 2;
	}
    else if(Type==MODEL_SWORD+18)
    {
        Color = 0;
    }
    else if ( Type==MODEL_BOW+17 )
    {
        Color = 0;
    }
    else if ( Type==MODEL_STAFF+9 )
    {
        Color = 0;
    }
#ifdef PBG_ADD_NEWCHAR_MONK_ITEM
	else if(Type == MODEL_ARMORINVEN_60
		|| Type == MODEL_ARMORINVEN_61
		|| Type == MODEL_ARMORINVEN_62)
	{
		Color = 0;
	}
#endif //PBG_ADD_NEWCHAR_MONK_ITEM
	else
	{
		int ItemType = Type-MODEL_ITEM;
		if(ItemType/MAX_ITEM_INDEX>=7 && ItemType/MAX_ITEM_INDEX<=11)
		{
			switch(ItemType%MAX_ITEM_INDEX)
			{
            case 0 :Color=0;break;  
            case 1 :Color=0;break;
            case 2 :Color=0;break;
            case 3 :Color=0;break;
            case 4 :Color=1;break;   
            case 5 :Color=0;break;     
            case 6 :Color=0;break; 
            case 7 :Color=0;break; 
            case 8 :Color=0;break;  
            case 9 :Color=0;break;    
            case 10:Color=0;break;
            case 11:Color=0;break;     
            case 12:Color=0;break;     
            case 13:Color=0;break;     
            case 14:Color=1;break;    
            case 15:Color=1;break;
            case 16:Color=0;break;
            case 17:Color=1;break;
            case 18:Color=2;break;
            case 19:Color=0;break;
			case 21:Color=3;break;
			case 39:Color=1;break;
			case 40:Color=1;break;
			case 41:Color=1;break;
			case 42:Color=1;break;
			case 43:Color=2;break;
			case 44:Color=3;break;
			case 45:Color=0;break;
#ifdef PBG_ADD_NEWCHAR_MONK_ITEM
			case 59:Color=0;break;
			case 60:Color=0;break;
			case 61:Color=0;break;
#endif //PBG_ADD_NEWCHAR_MONK_ITEM
			}
		}
	}
	Bright *= Alpha;
	switch(Color)
	{
	case 0: Vector(Bright*1.0f*Light[0],Bright*1.0f*Light[1],Bright*1.0f*Light[2],Light);break;
	case 1: Vector(Bright*1.0f*Light[0],Bright*0.5f*Light[1],Bright*0.0f*Light[2],Light);break;
	case 2: Vector(Bright*0.0f*Light[0],Bright*0.5f*Light[1],Bright*1.0f*Light[2],Light);break;
	case 3: Vector(1.f, 1.f, 1.f,Light);	//
	}
}

int main(){for(int g=0;g<12;g++)for(int i=0;i<=80;i++){int t=g*512+i;float a[3]={.9f,.8f,.7f},b[3]={.9f,.8f,.7f};PartObjectColor(t,.6f,.7f,a,false);PartObjectColor2(t,.6f,.7f,b,false);printf("%d %.9g %.9g %.9g %.9g %.9g %.9g\n",t,a[0],a[1],a[2],b[0],b[1],b[2]);}}