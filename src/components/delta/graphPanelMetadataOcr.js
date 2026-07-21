// SiteSeven のグラフ枠右下にある黄色の「最高出玉」専用 OCR。
// deltaEngine が返す panel bbox を基準にするため、外部 API や汎用 OCR は不要。

const REFERENCE_PANEL_WIDTH = 366;
const REFERENCE_PANEL_HEIGHT = 320;
const NORMALIZED_DIGIT_WIDTH = 16;
const NORMALIZED_DIGIT_HEIGHT = 24;
const NORMALIZED_DIGIT_PIXELS = NORMALIZED_DIGIT_WIDTH * NORMALIZED_DIGIT_HEIGHT;
const YELLOW_THRESHOLDS = Object.freeze([25, 40, 55]);
const VALUE_REGION = Object.freeze({ x0: 225, x1: 326, y0: 270, y1: 318 });
const DIGIT_CELLS = Object.freeze([
  Object.freeze([233, 250]),
  Object.freeze([249, 266]),
  Object.freeze([273, 289]),
  Object.freeze([288, 304]),
  Object.freeze([303, 320]),
]);

export const GRAPH_MAX_PAYOUT_OCR_CONFIG = Object.freeze({
  yellowThresholds: YELLOW_THRESHOLDS,
  maximumScore: 0.08,
  minimumMargin: 0.001,
  maximumDigits: DIGIT_CELLS.length,
});

// 固定テンプレートは、ground truth を明示した実画像から下部の開発補助関数で採取する。
// 実行時に画像の値を正解として自己学習することはない。
const PACKED_DIGIT_TEMPLATES = [[{"a":0.63636,"d":0.69805,"p":"WeDbUdGjscL0dXvm83R75cyxubxMxsND","b":"D/Af+D/8f/5//v/+/n/8P/w//D/8P/w//D/8P/w//D/8P/5///5//n/8P/wf+Afg"},{"a":0.63636,"d":0.70779,"p":"QdTkaau8m+DOkVn8zY9d/KnFpdw0uc9X","b":"D/Af/D/+P/5//39/fj9+P/4//j/+P/4//j/+P/4//j9+P34/f/9//j/+P/wP+Afg"},{"a":0.63636,"d":0.69481,"p":"WeHcUdCnsMT0dXvl83R75cuxubxMyMVE","b":"D/Af+D/8f/5//v/+/H/8P/w//D/8P/w//D/8P/w//D/8P/5///5//n/8P/wf+Afg"},{"a":0.68182,"d":0.6697,"p":"Gb7oamzMjOOOqUf8l6dK/HXRl9wTpdRX","b":"A/AP/B/+H/4//z8/Pz8/P38/fz9/P38/fz9/P/8//j++P78/v/8//h/+H/wH+APg"},{"a":0.63636,"d":0.70455,"p":"QdTlaqvAm+PNk1n8zZJc/KnGpdwzu9FX","b":"B/Af/D/+P/5//39/fj9+P/4//j/+P/4//j/+P/4//j9+P34/f/9//j/+P/wP+Afg"},{"a":0.68182,"d":0.67273,"p":"Gb3oaWzKjOGPpkj8lqVL/HTRl9wTpNJX","b":"B/AP/B/+H/4//z8/Pz8/P38/fz9/P38/fz9/P/8//j++P78/v/8//h/+H/wH+APg"},{"a":0.63636,"d":0.69481,"p":"WeDbUdGjscD0dHvk83R75cyxubxMxsND","b":"D/Af+D/8f/5//v/+/H/8P/w//D/8P/w//D/8P/w//D/8P/5///5//n/8P/wf+Afg"},{"a":0.63636,"d":0.70779,"p":"QdTkaau8m+HOkFr8zY9d/KnFpdw0uc9X","b":"D/Af/D/+P/5//39/fj9+P/4//j/+P/4//j/+P/4//j9+P34/f/9//j/+P/wP+Afg"},{"a":0.80952,"d":0.7395,"p":"c3VwWn2PfWlejGJnVIZjaUVvcF8pR1JE","b":"//z//P/8//////////8fnx+fH58fnx+fH58fnx+fH58fnx//H/8f/x//B/wH/Af8"},{"a":0.80952,"d":0.79832,"p":"R2FnSGVycFZxdVZSgHhZVHVsZFI/SU9B","b":"H/wf/B/8////////////n/+f/5//n/+f/5//n/+f/5//n//8//z//P/8B/wH/Af8"},{"a":0.80952,"d":0.89076,"p":"UWNjQHd8ckuFgGRFh4BkS3V4cFFQWl9M","b":"D/gP+A/4////////////////////////////////////////////////P/g/+D/4"},{"a":0.66667,"d":0.89796,"p":"SmNnVGN5godzeICfeHp9omp7gYlJX15R","b":"//z//P/8//////////////////////4//j/+P/4//j/+P/////////////z//P/8"},{"a":0.80952,"d":0.78992,"p":"UGZdRoqJbVqflmRopJ1nbYyNemZQX2VT","b":"B/wH/Af8////////////n/+f/5//n/+f/5//n/+f/5//n///////////B/wH/Af8"},{"a":0.80952,"d":0.84034,"p":"UWNjQHd8ckuFgGRFh4BkS3V4cFFQWl9M","b":"D/gP+A/4////////////+P/4//j/+P/4//j/////////////////////P/g/+D/4"},{"a":0.7619,"d":0.91071,"p":"RWFePmlsbGh0XGSEe2JnhHFpaGlHWlg8","b":"P/w//D/8//z//P/8//z/////////////////////////////////////P/w//D/8"},{"a":0.80952,"d":0.77311,"p":"PVVbQmhtaVKEeFhNhXpZUWptZ1Q8VFdJ","b":"B/wH/Af8H/8f/x//H///n/+f/5//n/+f/5//n/+f/5//n//8//z//P/8H/wf/B/8"},{"a":0.66667,"d":0.83673,"p":"VWlrVXOBe2aCfmFhiYFbXXuBa1ZUY2JO","b":"H/wf/B/8//////////////////////4//j/+P/4//j/+P///////////H/wf/B/8"},{"a":0.80952,"d":0.79832,"p":"OF1lR2Fyc1dudV1TeXZXU3ZvY1BOXVtI","b":"B/wH/Af8H/wf/B/8H/z///////////+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.70833,"d":0.75,"p":"QVFRQYKAaluPl2VmZpNtaFx6e2Q6SVtJ","b":"B/wH/Af8/////////////////5//n/+fH58fnx+fH/8f/x//////////APAA8ADw"},{"a":0.70833,"d":0.74265,"p":"OUpMNWtrZEtxdlpRVXBeVVlvb1c7TlY8","b":"B/wH/Af8//z//P/8/////////5//n/+fH58fnx+fH/8f/x////z//P/8B/AH8Afw"},{"a":0.6,"d":0.808,"p":"TGJcMHF7b0h2d2ZEdHNmSmhxaVFKVlRB","b":"H8AfwB/AH8D/+P/4////////////////////////////////////////H8AfwB/A"},{"a":0.68,"d":0.82588,"p":"S0xYRHB6dF2Ck21kmJtoZoiDc11KUlhH","b":"B/wH/Af8B/z/////////////////n/+f/5//n/+f////////////////B/wH/Af8"},{"a":0.68,"d":0.68471,"p":"MExbOmJucFF1cl5NX25ZUFhhZVBDRFBA","b":"B/AH8AfwB/Af/B/8////////////n/+f/58fnx+fH/8f/x////z//P/8B/AH8Afw"},{"a":0.68,"d":0.65647,"p":"MExbOmJucFF1cl5NX25ZUFhhZVBDRFBA","b":"B/AH8AfwB/Af/B/8//z//P/8//z/nP+c/58fnx+fH/8f/x////z//P/8B/AH8Afw"},{"a":0.68,"d":0.73412,"p":"JjQ/NGhsZVejm25nsaVnaI6LdWZJWWVW","b":"APAA8ADwAPAf/B/8////////////n/+f/5//n/+f////////////////B/wH/Af8"},{"a":0.68,"d":0.68471,"p":"NjY7LVddWUZdcF5RVnFZU0VmaFYrUl5L","b":"B/AH8AfwB/D//P/8//////////8fnx+fH58fnx+fH/8f/x//H/wf/B/8B/wH/Af8"},{"a":0.80952,"d":0.7479,"p":"VVlVRF5sY09ac1dTUm5eUz1ialgoTltH","b":"//z//P/8//////////8fnx+fH58fnx+fH58f/x//H/8f/x/8H/wf/B/8B/wH/Af8"},{"a":0.80952,"d":0.78992,"p":"VGFlVXKLdWCCnWVnjJdlZ3t+c2JJWF9P","b":"B/wH/Af8////////////n/+f/5//n/+f/5//n/+f/5//n///////////B/wH/Af8"},{"a":0.80952,"d":0.77311,"p":"V2BeRWBpZE52a1RPg2xYUXVzblpGYWNM","b":"H/wf/B/8H/8f/x//H///n/+f/5//n/+f/5//n/+f/5//n//8//z//P/8B/wH/Af8"},{"a":0.80952,"d":0.78992,"p":"VFdURoiEcWKQmGdrjpZjaYWJfWxXaHBc","b":"B/wH/Af8////////////n/+f/5//n/+f/5//n/+f/5//n///////////B/wH/Af8"},{"a":0.80952,"d":0.78992,"p":"Q2VeN2OIgFNngXldX3p1XluBhWREa3JQ","b":"P/g/+D/4P/g/+D/4P/j//////////////////z/4P/g/+D/4P/g/+D/4P/g/+D/4"},{"a":0.80952,"d":0.82353,"p":"PU1NOWRrY0xwelpSdHlZU25vbFxEWGBQ","b":"H/wf/B/8//z//P/8//z/n/+f/5//n/+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.66667,"d":0.86735,"p":"TltWRHeBcVuHhmZfg35eXnF8d2lYaGxd","b":"H/wf/B/8//////////////////////4//j/+P/4//j/+P/////////////z//P/8"},{"a":0.80952,"d":0.79832,"p":"O1FUOWBoZElsb1ZLc29QTH17bFZWa2VN","b":"B/wH/Af8H/wf/B/8H/z///////////+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.70833,"d":0.79412,"p":"QU1PPoSKc1+NmWhnlpVqbH6Ce2U1QUo8","b":"B/wH/Af8/////////////////5//n/+f/5//n/+f////////////////APAA8ADw"},{"a":0.70833,"d":0.74265,"p":"NEdMM2Fua1BudFhOeW9dUl9naFYrOEI1","b":"B/wH/Af8H/wf/B/8/////////5//n/+f/5//n/+f////////H/wf/B/8B/AH8Afw"},{"a":0.70833,"d":0.72059,"p":"NEdMM2Fua1BudFhOeW9dUl9naFYrOEI1","b":"B/wH/Af8H/wf/B/8/////////5//n/+f/5//n/+f////////H/wf/B/8APAA8ADw"},{"a":0.7619,"d":0.84821,"p":"VGBgUXyDgY+BgG2fanFnlFxxf4lIXnBd","b":"P/w//D/8//////////////////////8f/x//Hz8fPx8/H///////////x/zH/Mf8"},{"a":0.80952,"d":0.91597,"p":"UV5TRY6Je2KgkXtslIt5aIR+eGBTYmJP","b":"H/wf/B/8////////////////////////////////////////////////H/wf/B/8"},{"a":0.80952,"d":0.84034,"p":"S1FMQHZuY1Nub1pSWGhWS1tqZE9RWllG","b":"H/wf/B/8////////////n/+f/5//n/+f/5//nx+fH58fn/////////////z//P/8"},{"a":0.80952,"d":0.89076,"p":"R1JMP4GFfmOlloFtqJR6apqZkHFmgH9i","b":"B/wH/Af8////////////////////////////////////////////////H/wf/B/8"},{"a":0.80952,"d":0.81513,"p":"OUxSQGJ0c1h0eGFUeG9YToB8eV1ccHZX","b":"B/wH/Af8H/8f/x//H/////////////+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.68,"d":0.74824,"p":"OEdDNWuDfFp/jINsiot8b3+Jg2JEVVNB","b":"B/AH8AfwB/Af/B/8////////////////////////////////H/wf/B/8B/AH8Afw"},{"a":0.68,"d":0.72,"p":"OEdDNWuDfFp/jINsiot8b3+Jg2JEVVNB","b":"B4AHgAeAB4Af/B/8////////////////////////////////H/wf/B/8B/AH8Afw"},{"a":0.68,"d":0.70588,"p":"KTI1K1xmZk5+dl9PgHRZTGZmZlE0P0c+","b":"B/AH8AfwB/Af/B/8////////////n/+f/5//n/+f////////H/wf/B/8B/AH8Afw"},{"a":0.68,"d":0.67765,"p":"KTI1K1xmZk5+dl9PgHRZTGZmZlE0P0c+","b":"APAA8ADwAPAf/B/8////////////n/+f/5//n/+f////////H/wf/B/8B/AH8Afw"},{"a":0.80952,"d":0.7479,"p":"VmNjTXp2aVKCdVRKfXJgT1deYU8uOEI6","b":"H/wf/B/8////////////n/+f/5//n/+f/5///////////x/8H/wf/B/8APAA8ADw"},{"a":0.80952,"d":0.81513,"p":"R3R3VmOLiGZqhHdmaYV4aFd6el04U1hD","b":"H/wf/B/8H/8f/x//H////////////x//H////////////x//H/8f/x//B/wH/Af8"},{"a":0.80952,"d":0.78992,"p":"V294WHiBe1xzd1dHYXVbTFRra1VHU2BN","b":"H/wf/B/8////////////n/+f/5//n/+f/5//nx+fH58fn///////////B/wH/Af8"},{"a":0.7619,"d":0.8125,"p":"PFhoVlhvf4ZpdWyfe3tqp3Z0eJJDU1tV","b":"B/wH/Af8P/8//z//P/8//z//P/////8f/x//H/8f/x//H///////////P/w//D/8"},{"a":0.80952,"d":0.91597,"p":"TV9kToJ+fGGdjHdiqJJ2YpeQfltbbWhP","b":"H/wf/B/8////////////////////////////////////////////////H/wf/B/8"},{"a":0.80952,"d":0.77311,"p":"OlBbRlNqbFZhdl5QbXhbT2xoX0tBSFBE","b":"B/wH/Af8H/wf/B/8H/z//////////x+fH5//n/+f/5//n///////////H/wf/B/8"},{"a":0.70833,"d":0.80882,"p":"P11iRnyAfF2MinZlfYt6ZW+Bf2FFUlxE","b":"B/AH8Afw//z//P/8//////////////////////////////////z//P/8B/AH8Afw"},{"a":0.70833,"d":0.72059,"p":"Mk9dQmhwcVqMeWBZiHNbSmFoa08uSFxA","b":"B/AH8AfwH/wf/B/8/////////5//n/+f/5//n/+f////////H/wf/B/8B/AH8Afw"},{"a":0.70833,"d":0.70588,"p":"Mk9dQmhwcVqMeWBZiHNbSmFoa08uSFxA","b":"B/AH8AfwH/wf/B/8/////////5//n/+f/5//n/+f//z//P/8H/wf/B/8B/AH8Afw"},{"a":0.80952,"d":0.84034,"p":"R2pqUGGChG1og3hvZn93ZlV2dVo5XVxF","b":"H/wf/B/8H/8f/x//H////////////////////////////x//H/8f/x//B/wH/Af8"},{"a":0.68,"d":0.72,"p":"JzhFMlJiYElrdmBOd29XSHFnYkpJU11H","b":"APAA8ADwAPAf/B/8////////////n/+f/5//n/+f//////////z//P/8B/wH/Af8"},{"a":0.68,"d":0.69176,"p":"JzhFMlJiYElrdmBOd29XSHFnYkpJU11H","b":"APAA8ADwAPAf/B/8////////////n/+f/5//nP+c//z//P/8//z//P/8B/wH/Af8"},{"a":0.80952,"d":0.91597,"p":"TVxfRXeEfF+DjXlnhIt3ZYuThWNefXVU","b":"H/wf/B/8////////////////////////////////////////////////H/wf/B/8"},{"a":0.7619,"d":0.92857,"p":"T1pZQ2ZpbXB6amyCg2lpgXR4fndMbHJQ","b":"P/w//D/8////////////////////////////////////////////////P/w//D/8"},{"a":0.80952,"d":0.81513,"p":"QlRcRXBwa1GDeVtPgndaTXd9eVxMaXRX","b":"B/wH/Af8////////////n/+f/5//n/+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.80952,"d":0.79832,"p":"QlRcRXBwa1GDeVtPgndaTXd9eVxMaXRX","b":"B/wH/Af8//z//P/8//z/n/+f/5//n/+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.70833,"d":0.78676,"p":"QlVTPo+Vg2CpmXprnZN6ZnaHe1QxREQx","b":"B/wH/Af8//z//P/8////////////////////////////////H/wf/B/8APAA8ADw"},{"a":0.70833,"d":0.72059,"p":"N0JHNWVralBzdVxRe3lhU2pwb1IvOEA1","b":"B/wH/Af8H/wf/B/8/////////5//n/+f/5//n/+f////////H/wf/B/8APAA8ADw"},{"a":0.80952,"d":0.79832,"p":"N0JHNV9nZ01ydWNTeHdYUHt8cVdhaWtP","b":"B/wH/Af8H/wf/B/8H/z///////////+f/5//n/+f/5//n///////////H/wf/B/8"},{"a":0.68,"d":0.77647,"p":"NUZHM3eJhmOKj4NrgYp4aHCJfmZQYl9H","b":"APAA8ADwAPAf/B/8////////////////////////////////////////B/wH/Af8"},{"a":0.68,"d":0.72,"p":"LDtCMVxqd1ptcGVWd3RbUX2AcVxKW1xF","b":"APAA8ADwAPAf/B/8////////////n/+f/5//n/+f//////////z//P/8B/wH/Af8"},{"a":0.69565,"d":0.75,"p":"OHiBP2yWlnh3hm6JgY5vhXKglXUsZG43","b":"AcAf/B/8f/9///////////4//j9+P34//j/+P/4//j////////9//H/8H/wBwAHA"},{"a":0.73913,"d":0.71611,"p":"Mm+HR2ebk4B0hmOOYoNik1KXi4opXmo6","b":"A/AP+A/4n/6f/v/+//7//////////3//f/9//3//f/9//x/+H/4f/h/+D/gAwADA"},{"a":0.72727,"d":0.76136,"p":"K3GHOWuVnG18iXeCa4ZvhWSSh4I4epBN","b":"B/AH8B/8H/z//////////////j/+P/4/fj9+P34/fj9+P34/f////5/8n/wf8B/w"},{"a":0.77273,"d":0.74599,"p":"ImSIRV6VlIZ9imeXXoFZmVONeog4fZVR","b":"A/AD8B/4H/if/p/+//7//v////9//n/+f/9//3//f/9//3/+f/4f/h/+H/4P+A/4"},{"a":0.68182,"d":0.76667,"p":"PoiMRnCPjnOEe3qCeHJygGmDiXgzbnM9","b":"D/AP8D/8P/z////////+//5//n/+f/5//n/+f/5//n/+f/7//////z/8P/wP8A/w"},{"a":0.72727,"d":0.81818,"p":"J4yQQl6fiHt0jGGUbYJal1SXdnwbgYI8","b":"D/gP+D/+P/4//j/+////f/9//3//fv9+/3//f/9//3//f/9+//4//j/+P/4P+A/4"},{"a":0.72727,"d":0.79545,"p":"Rp2nTnSbl3yHhXSJgYV3jXKWj3suYW87","b":"H/wf/H/8f/z////////+P/4//j/+P/4//j/+P/4//j////////9//3//H/wHwAfA"},{"a":0.68182,"d":0.76364,"p":"OJKSVmmAeJGIY1eohWJcsF13f5YkanZE","b":"D/wP/D//P///////////f/5//H/8f/x//H/8f/x//H/+f/9///8//z//P/wH8Afw"},{"a":0.73913,"d":0.74169,"p":"JWuDQleTloRsiGKRf4ZckGuViYcjYHdF","b":"AMAP+A/4H/4f/p/+n/7///////9//3/////////////////+//6f/p/+D/gD8APw"},{"a":0.72727,"d":0.77273,"p":"L2x3Nl6Xn2pzgnN/i4FvioGSjYNFf5BQ","b":"B8AHwB/8H/x//3//f/9//3//fj/+P/4//j/+P/4//j/+P/4//////3/8f/wf/B/8"},{"a":0.70833,"d":0.69363,"p":"I113PFeZnoBpi2GTgohhlGGTjYQcQVsq","b":"A/AD8A/4D/gf/h/+//7//n//f/9//3//f/////////7//p/+n/6f/g/4D/gAwADA"},{"a":0.72727,"d":0.73864,"p":"LneAPVafoXhkh3aDeYNvg3OPh3szd31J","b":"B/AH8B/8H/x//3//f/9//3//fj9+P34/fj9+P/4//j/+P/4//////x/8H/wH8Afw"},{"a":0.77273,"d":0.80481,"p":"LWl+SE6SkIZuiWiXmIdhmHyVgIwtcH5L","b":"D/gP+J/+n/6f/p/+//5//n//f//////////////////////+//6f/h/+H/4P+A/4"}],[{"a":0.47619,"d":0.61905,"p":"AC3j1JLf/teGSvfdAAD23QAA9t0AAPbc","b":"AH8A/wH/B/8/////////////+P/4/4D/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.47619,"d":0.61905,"p":"AC3k1JLf/tyIS/fcAAD23AAA9twAAPbb","b":"AH8A/wH/B/8/////////////+P/4/4D/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.47619,"d":0.60952,"p":"ABjO8m7O/fxvXcn8AADF/AAAxfwAAMT7","b":"AH8AfwD/B/8f/////////////v/8/yD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.47619,"d":0.61905,"p":"AC3j1JLf/tiGSvfdAAD23QAA9t0AAPbc","b":"AH8A/wH/B/8/////////////+P/4/4D/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.47619,"d":0.61429,"p":"ABjN8W7O/fpuXcv8AADG/AAAxvwAAMX7","b":"AH8A/wD/B/8f/////////////v/8/yD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.47619,"d":0.61905,"p":"AC3j1JLf/tmGSffbAAD23QAA9t0AAPbc","b":"AH8A/wH/B/8/////////////+P/4/4D/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.78571,"p":"MWZtWERze10yZGxII1RfRBQ+TD4NKzgt","b":"D/8P/w///////////////////////w//D/8P/w//D/8P/w//D/8P/w//AP8A/wD/"},{"a":0.57143,"d":0.75,"p":"MWZtWERze10yZGxII1RfRBQ+TD4NKzgt","b":"D/8P/w///////////////////////w//D/8P/w//D/8P/w//D/8P/w//APAA8ADw"},{"a":0.66667,"d":0.83333,"p":"KmBnVEd2fmI7a3NNKVxkQxxLWUUROkc7","b":"D/8P/w//D///////////////////////D/8P/w//D/8P/w//D/8P/w//D/8P/w//"},{"a":0.57143,"d":0.57143,"p":"LGNjNz9zdkIvbnNEHWRtRBZRXTwPOkMr","b":"D/AP8A/w//D/8P/w//D//////////w/wD/AP8A/wD/AP8A/wD/AP8A/wAPAA8ADw"},{"a":0.57143,"d":0.75,"p":"J0VRTEJZY2E+XWVoKkxYYSAyRVAcJDxB","b":"D/8P/w///////////////////////w//D/8P/wD/AP8A/w//D/8P/w//AP8A/wD/"},{"a":0.57143,"d":0.71429,"p":"J0VRTEJZY2E+XWVoKkxYYSAyRVAcJDxB","b":"D/8P/w///////////////////////w//D/8P/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.60714,"p":"HTRYSSxgcV0oXHZgIUJoXRYxTVAOJjg8","b":"AP8A/wD/D/8P/w//D////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.67857,"p":"L1NiTFpleWBIWndkKkdsYxssV1oXHT9J","b":"AP8A/wD//////////////////////w//D/8P/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.66667,"d":0.62245,"p":"OkBRNU9gbU45WnVcJUZkVRosQz8RHCon","b":"4H/gf+B///////////8//z//P/8f/wf/B/8D/wB/AH8AfwB/AH8AfwB/AH8AfwB/"},{"a":0.77778,"d":0.61905,"p":"MjZJLlJgaUlEYHlbLVRyXRw4V00ZKD06","b":"4HjgeOB44Hj//////////z//P/8//z//B/8H/wf/B/8AfwB/AH8AfwB/AH8AfwB/"},{"a":0.5,"d":0.77778,"p":"JkJLQl5paVxncnBhUWhsXzJPXFswQElM","b":"B/8H/wf/B///////////////////////B/8H/wf/B/8H/wf/B/8H/wf/B/8H/wf/"},{"a":0.57143,"d":0.60714,"p":"IFVcPDtwdUhFdnQ/LGRjNhhFSisWNDgg","b":"D/AP8A/w//D/8P/w//D//////////w/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/w"},{"a":0.66667,"d":0.58333,"p":"GU1UODZtdElJenhDQHFvOhdWVzIYP0Uo","b":"D/AP8A/wD/AP8A/wD/AP8P//////////D/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/w"},{"a":0.57143,"d":0.67857,"p":"IDhCQ0BTXVlLYWlcM1BjXB80UlQYKkhO","b":"AP8A/wD/D/8P/w//D////////////w//D/8P/w//D/8P/wD/AP8A/wD/AP8A/wD/"},{"a":0.48,"d":0.67,"p":"IERQPTltdlZCfIRfJFpqWhU+UU4OLj07","b":"APAA8ADwAPAP/w////////////////////8P/w//D/8P/w//D/8P/w//APAA8ADw"},{"a":0.54545,"d":0.72727,"p":"GzxJODFgak5DfYReMGl2XRpLXVUUO01L","b":"APAA8ADwAPAP/w//D////////////////////w//D/8P/w//D/8P/w//D/8P/w//"},{"a":0.66667,"d":0.59184,"p":"PUBbVFtfdmtBRWtrIihWYSskSFYpHzdE","b":"B/8H/wf//////////////////////wB/AH8AfwB/AH8AfwB/AH8AfwB/AHgAeAB4"},{"a":0.66667,"d":0.57143,"p":"QWFFI1N6WzBBdmI+K2RbSSFIQzQVMCkc","b":"H+Af4B/g//j//P/8//z//P/8//z//B/8H/wf/x/nH+cf5x/gH+Af4A/gAeAB4AHg"},{"a":0.77778,"d":0.63095,"p":"O1k/H1N5WDBUf2QxLm5hTChaVUceQj0u","b":"H+Af4B/gH+D//P/8//z//P/8//z//P/8H/wf/B/8H/wf5x/nH+cf5x/gH+Af4B/g"},{"a":0.66667,"d":0.63265,"p":"MURMNExjZ0U/W2xTKURgWSAxQ0AbIysk","b":"H/wf/B/8//z//P/8//z//P/8//z//B/8H/wP/wH/Af8B/x/8H/wf/A/4AeAB4AHg"},{"a":0.77778,"d":0.70238,"p":"KTtFL0thZENQaHBNLk9pWSU6WFkfLjw4","b":"H/wf/B/8H/z//P/8//z//P/8//z//P/8H/wf/B/8H/wB/wH/Af8B/x/8H/wf/B/8"},{"a":0.77778,"d":0.63095,"p":"KTtFL0thZENQaHBNLk9pWSU6WFkfLjw4","b":"AfwB/AH8Afz//P/8//z//P/8//z//P/8H/wf/B/8H/wB/wH/Af8B/wH8AfwB/AH8"},{"a":0.57143,"d":0.64286,"p":"KkBRRT9acmAzUnVmHj9nXhEuU1ILIkBG","b":"AP8A/wD//////////////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.66667,"d":0.59184,"p":"NlM+KVNwWEBGbldBMF9NOyVUSjsgQzsp","b":"H+Af4B/g//j//P/8//z/5//n/+f/5x/nH+cf4x/gH+Af4B/8H/wf/B/4H+Af4B/g"},{"a":0.57143,"d":0.67857,"p":"Hk5MJ0NycUQ4bHNQIlVjTRZATkAPMDsv","b":"AP8A/wD//////////////////////w//D/8P/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.64286,"p":"Hk5MJ0NycUQ4bHNQIlVjTRZATkAPMDsv","b":"APAA8ADw/////////////////////w//D/8P/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.66667,"d":0.66667,"p":"EkJAH0JwbkBGeHtQKl9qTxpKW0oVPUo9","b":"APAA8ADwAPD/////////////////////D/8P/w//D/8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.64286,"p":"J0lHI1J6dDZGeHg9JmNqPRVaZD8WSlIz","b":"D/AP8A/w/////////////////////w/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/w"},{"a":0.57143,"d":0.60714,"p":"J0lHI1J6dDZGeHg9JmNqPRVaZD8WSlIz","b":"D/AP8A/w//D/8P/w//D//////////w/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/w"},{"a":0.66667,"d":0.63265,"p":"KT83IkRlWzdCbGdBM2BhSypTWFIiQkY2","b":"AfwB/AH8D/wf/B/8H/z//P/8//z//B/8H/wf/x//H/8f/x/8H/wf/A/8AfwB/AH8"},{"a":0.66667,"d":0.60204,"p":"KT83IkRlWzdCbGdBM2BhSypTWFIiQkY2","b":"AeAB4AHgD/gf/B/8H/z//P/8//z//B/8H/wf/x//H/8f/x/8H/wf/A/8AfwB/AH8"},{"a":0.77778,"d":0.66667,"p":"QmFXNEpyakE6ZmRBLFpeVSpRV1EfPUAu","b":"H/wf/B/8H/z//P/8//z//B/8H/wf/B/8H/8f/x//H/8f/B/8H/wf/AH8AfwB/AH8"},{"a":0.57143,"d":0.75,"p":"KERLQEBqclU3anFXJlZhTh5EUUcTMDw3","b":"D/8P/w///////////////////////w//D/8P/wD/AP8A/w//D/8P/w//AP8A/wD/"},{"a":0.66667,"d":0.79167,"p":"IDg/Oj9nb1JDdHpcK19oUSBNWUodQU5G","b":"D/8P/w//D///////////////////////D/8P/w//D/8A/wD/AP8A/w//D/8P/w//"},{"a":0.57143,"d":0.78571,"p":"ITxFPDlpclc4bnhZJl9qTyFQXU0cPUs+","b":"AP8A/wD//////////////////////w//D/8P/w//D/8P/w//D/8P/w//D/8P/w//"},{"a":0.57143,"d":0.75,"p":"ITxFPDlpclc4bnhZJl9qTyFQXU0cPUs+","b":"APAA8ADw/////////////////////w//D/8P/w//D/8P/w//D/8P/w//D/8P/w//"},{"a":0.57143,"d":0.60714,"p":"HDE2LjBYYU8rU2JVHDdOTxQqQU0NITFA","b":"AP8A/wD/D/8P/w//D////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.57143,"d":0.71429,"p":"K0hIOGV8elpcb3tfKUtqWxk9Z2QYMlda","b":"AP8A/wD//////////////////////w//D/8P/wD/AP8A/wD/AP8A/w//D/8P/w//"},{"a":0.57143,"d":0.57143,"p":"HDE2LjBYYU8rU2JVHDdOTxQqQU0NITFA","b":"APAA8ADwD/8P/w//D////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.5,"d":0.72222,"p":"VVpXS2BpZ1pGUVRQJzxITSs4RE0dJzE7","b":"/////////////////////wf/B/8H/wf/B/8H/wf/B/8H/wf/B/8H/wA/AD8APwA/"},{"a":0.57143,"d":0.64286,"p":"K0hIOGV8elpcb3tfKUtqWxk9Z2QYMlda","b":"APAA8ADw/////////////////////w//D/8P/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.56,"d":0.58286,"p":"JDU1KldtaltUc3NiLmBtTB9KXkoXJDYv","b":"AeAB4AHgAeAf4B/g//////////////////8f/B/8H/wf/B/8H/wf/B/8AeAB4AHg"},{"a":0.63636,"d":0.63312,"p":"GSkrIEhdWk1bd3VnOmdvUSNZaUofQVdI","b":"AeAB4AHgAeAP4B/gH+D//////////////////x/8H/wf/B/8H/wf/B/8H/wf/B/8"},{"a":0.77778,"d":0.69048,"p":"UWRhUmB7d2pMbXBcKGFuRyBUZ0wfO1JG","b":"H+Af4B/gH+D/////////////////////H/wf/B/8H/wf/B/8H/wf/AH8AfwB/AH8"},{"a":0.57143,"d":0.75,"p":"MmBnSEFzelc2aHJTJFhjShxBSzoQLDYs","b":"D/8P/w///////////////////////w//D/8P/w//D/8P/w//D/8P/w//APAA8ADw"},{"a":0.7619,"d":0.58036,"p":"OlVXNlJpaU5BVmVXJkhcVCI7SEMbIi4t","b":"B/wH/Af8//z//P/8//z//////////wD8APwA/wD/AP8A/wD8APwA/AD8APwA/AD8"},{"a":0.7619,"d":0.55357,"p":"OlVXNlJpaU5BVmVXJkhcVCI7SEMbIi4t","b":"B/wH/Af8//z//P/8//z//////////wD8APwA/wD/AP8A/wD8APwA/AD8ABwAHAAc"},{"a":0.66667,"d":0.79167,"p":"LVlgQ0Bze1dCcXhWKV9sTx9RWUQbO0Y3","b":"D/8P/w//D///////////////////////D/8P/w//D/8P/w//D/8P/w/wD/AP8A/w"},{"a":0.88889,"d":0.58333,"p":"Mk5RL1FqaUtTZmhXMEdhVx1JVlAkNkQ/","b":"B+AH4AfgB+D//P/8//z//P//////////APwA/AD8APwA/wD/AP8A/wD8APwA/AD8"},{"a":0.7619,"d":0.63393,"p":"NVBWPFdoZVBJVl5ULz1QUikzREQgJzQt","b":"B/wH/Af8//z//P/8//z//////////8D/wP/A/8D/wP/A/wD8APwA/AD8APwA/AD8"},{"a":0.88889,"d":0.67708,"p":"K0hRNlVoZU5daWZVNkRWVCg2SlEqMkNA","b":"B/wH/Af8B/z//P/8//z//P//////////wP/A/8D/wP/A/8D/wP/A/wD8APwA/AD8"},{"a":0.57143,"d":0.71429,"p":"JkNbUUxoeWY/YHdjIUloWhM8YV4XMEtP","b":"AP8A/wD//////////////////////w//D/8P/wD/AP8A/w//D/8P/w//AP8A/wD/"},{"a":0.57143,"d":0.71429,"p":"IEVPOjlob1M8bXZWKmBsUB9NXU8WO0hD","b":"APAA8ADwD/8P/w//D////////////w//D/8P/w//D/8P/w//D/8P/w//D/8P/w//"},{"a":0.66667,"d":0.54082,"p":"LUFBNldsbl9Ua3JpOFNhUic8VUkeLEQ9","b":"AeAB4AHgD/gf/B/8H/z//////////x/8H/wP/AH8AfwB/AH8AfwB/AH8AfwB/AH8"},{"a":0.57143,"d":0.67857,"p":"IEVPOjlob1M8bXZWKmBsUB9NXU8WO0hD","b":"APAA8ADwD/8P/w//D////////////w//D/8P/w//D/8P/w//D/8P/w//AP8A/wD/"},{"a":0.77778,"d":0.59524,"p":"VGhqWWF4fHNHXWhgKkhbRSY4VEocKD85","b":"H/wf/B/8H/z//////////x/8H/wf/B/8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/AH8"},{"a":0.5,"d":0.6405,"p":"EkiYekyRxY45arGFEz2hiRA3kXwIIllO","b":"Af8B/wP/A/8f/x////////////8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/"},{"a":0.5,"d":0.6157,"p":"EkiYekyRxY45arGFEz2hiRA3kXwIIllO","b":"Af8B/wP/A/8f/x//////////H/8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/Af8B+AH4"},{"a":0.5,"d":0.56198,"p":"EzF8YUSBtXc1WaFzDy6LdQwldWYLGUY8","b":"AP8A/wP/A/8f/x////////////8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A+AD4"},{"a":0.59091,"d":0.47552,"p":"CzB+bTl3sYA4VaKDBySFfQsfeXYQFlBR","b":"AfwB/AH8Afwf/D/8//////////wB/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwAPAA8"},{"a":0.5,"d":0.6405,"p":"FDaBhUeBu6Q8W6KhESeGpwwgeJ4AFFZu","b":"Af8B/wP/A/8f/x////////////8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/"},{"a":0.5,"d":0.55372,"p":"EzF8YUSBtXc1WaFzDy6LdQwldWYLGUY8","b":"AP8A/wP/A/8f/x//////////H/8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A+AD4"},{"a":0.5,"d":0.53719,"p":"GESMXlmNtG9GZq5yDziZbQwwj2YKIGBH","b":"A/gD+AP4A/j/+P/4//////////gD+AP4A/gD+AP4A/gD+AP4A/gD+AP4A/gA+AD4"},{"a":0.5,"d":0.62397,"p":"FDaBhUeBu6Q8W6KhESeGpwwgeJ4AFFZu","b":"Af8B/wP/A/8f/x////////////8B/wH/Af8B/wH/Af8B/wH/Af8B/wH/Af8APwA/"},{"a":0.5,"d":0.645,"p":"IUiQkmiOs6xcbJ2hEh90lwwdb5wKGF6D","b":"AP8A/wf/B/8H/////////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/"},{"a":0.5,"d":0.635,"p":"IUiQkmiOs6xcbJ2hEh90lwwdb5wKGF6D","b":"AP8A/wf/B/8H/////////////////wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wAf"},{"a":0.54545,"d":0.60985,"p":"ETJmSDt6rWVHeLVoCzaWawQviF8MJGVD","b":"AHwAfAP/A/8P/w////////////9z/3P/A/8D/wP/A/8D/wP8A/8D/wP/A/8D/AP8"},{"a":0.54545,"d":0.57955,"p":"ETJmSDt6rWVHeLVoCzaWawQviF8MJGVD","b":"AHwAfAP/A/8P/w////////////9z/3P/A/8D/wP/A/8D/wP8A/8D/wP8A/wAfAB8"},{"a":0.5,"d":0.60331,"p":"BzFiUEaDp3ZZf6B+DzWBgAYveHsIK1hX","b":"APgA+AP/A/8f/x/////////////g/+D/A/8D/wD/AP8A/wD/A/8D/wD/AP8A/wD/"},{"a":0.5,"d":0.58678,"p":"BzFiUEaDp3ZZf6B+DzWBgAYveHsIK1hX","b":"APgA+AP/A/8f/x////////////8A/wD/A/8D/wD/AP8A/wD/A/8D/wD/AP8A/wD/"}],[{"a":0.71429,"d":0.63175,"p":"Q9XncaWzmNYBC57EAGblT2L1j0e8/v7l","b":"B/Af/D/+P/5//34/fj9+Pww/AH8AfwD+Af4D/Af4D/Af4B/AP/5//3//f/9/////"},{"a":0.66667,"d":0.66327,"p":"WtrsjcS3lvYCB6ThAF3za4P9hlHf/v78","b":"D/gf/B/+f/9///9//j/8Pww/AD8AfwD/Af4D/Af8D/gf8D+Af55/////////////"},{"a":0.71429,"d":0.6127,"p":"Q9bocaW2mdoCDZ3EAGXlUGL1kkq7/v7k","b":"B/Af/D/+P/5//34/fj9+PwA/AH8AfwD+Af4D/Af4D/Af4B/AP4B//3//f/9/////"},{"a":0.66667,"d":0.64966,"p":"WdztjcO5lvcDCaTiAF3zbIP9jFXe/v78","b":"D/gf/B/+f/9///9//j/8Pww/AD8AfwD/Af4D/Af8D/gf8D+Af4B/////////////"},{"a":0.66667,"d":0.66327,"p":"WtrsjcS4lvYCBqThAF3za4P9hlHf/v78","b":"D/gf/B/+f/9///9//j/8Pww/AD8AfwD/Af4D/Af8D/gf8D+Af55/////////////"},{"a":0.70833,"d":0.67647,"p":"KjxHQDBGWGEhOV5mL2FzSTRic1YqTFtK","b":"B/wH/Af8H/8f/x//H/8f/x//AP8A/wD/B/wH/Af8H/Af8B/w////////H/wf/B/8"},{"a":0.58333,"d":0.74107,"p":"SFNaTEVWbXwoSG6ATHlvVVN1ZE8/VEo9","b":"H/wf/B/8////////////////Af8B/wH/H/wf/B/8/+D/4P/g////////H+Af4B/g"},{"a":0.58333,"d":0.79464,"p":"OENIPkBQXGEuTWRnUXVqRFJ2a1RBW1hJ","b":"H/wf/B/8////////////////Af8B/wH/H/wf/B/8/+D/4P/g//////////z//P/8"},{"a":0.58333,"d":0.76786,"p":"OENIPkBQXGEuTWRnUXVqRFJ2a1RBW1hJ","b":"H/wf/B/8////////////////Af8B/wH/H/wf/B/8/+D/4P/g////////H/wf/B/8"},{"a":0.58333,"d":0.71429,"p":"SFNaTEVWbXwoSG6ATHlvVVN1ZE8/VEo9","b":"H/wf/B/8////////H/8f/x//Af8B/wH/H/wf/B/8/+D/4P/g////////H+Af4B/g"},{"a":0.66667,"d":0.64063,"p":"JkBRQyxIYmohNmZrMmtxUEZycFI5VldD","b":"B/wH/Af8P/8//z//OP84/zj/AP8A/wD/B+AH4AfgP+A/4D/g////////B/wH/Af8"},{"a":0.66667,"d":0.61719,"p":"JkBRQyxIYmohNmZrMmtxUEZycFI5VldD","b":"B/wH/Af8P/8//z//AP8A/wD/AP8A/wD/B+AH4AfgP+A/4D/g////////B/wH/Af8"},{"a":0.6,"d":0.688,"p":"SWNlNFZ3f0s5X3ZGR2plNWR5Z0NbbmlP","b":"H8AfwB/AH8D/+P/4//////////8D+AP4H/gf+B/4//j/wP/A//////////j/+P/4"},{"a":0.64,"d":0.675,"p":"Pl9gNktldGAwQXF0KFZxXD5qcFNDYWdS","b":"B+AH4AfgB+D//P/8//8//z//P/8A/wD/B/8H/Af8P/w/4D/g////////P/w//D/8"},{"a":0.56,"d":0.73714,"p":"KjY0LD1PUUs6UWdhQG5rSVt9aD5TbF9E","b":"H+Af4B/gH+D//P/8//////////8B/wH/D/8f/B/8//j/4P/g//////////z//P/8"},{"a":0.66667,"d":0.76531,"p":"O0xNR0FWYl44YG1VS3lpPV59bEhQaFxC","b":"H/wf/B/8//////////8B/wH/Af8P/x/8H/z/+P/g/+D/4P////////////z//P/8"},{"a":0.7619,"d":0.77679,"p":"MFNfRjtZd2slSHVnI1hqVFuAf2pmfnlm","b":"P/w//D/8//////////84/zj/OP8//wf8B/w//z/jP+M/4z//P/8///////z//P/8"},{"a":0.7619,"d":0.75893,"p":"MFNfRjtZd2slSHVnI1hqVFuAf2pmfnlm","b":"P/w//D/8P/8//z//P/84/zj/OP8//wf8B/w//z/jP+M/4z//P/8///////z//P/8"},{"a":0.7619,"d":0.76786,"p":"KkdSUjJTeH4pRYCIKU9yZllsZ1hhZlRH","b":"P/w//D/8P/8//z//P/8A/wD/AP8H/wf/B/8//z/gP+A/4P//////////////////"},{"a":0.7619,"d":0.74107,"p":"KkdSUjJTeH4pRYCIKU9yZllsZ1hhZlRH","b":"B/wH/Af8P/8//z//P/8A/wD/AP8H/wf/B/8//z/gP+A/4P//////////////////"},{"a":0.7619,"d":0.72321,"p":"KDpLTTFCZHYlRXJuIV1xUjVrdVY1XWVQ","b":"P/w//D/8P/8H/wf/B/8A/wD/AP8H/wf/B/8//z/gP+A/4D//P/8/////////////"},{"a":0.66667,"d":0.80612,"p":"ND9OTT5LaXY0V3FuPHFnUlR4a1ZNZl9Q","b":"//z//P/8//8f/x//H/8B/wH/Af8P/x//H//////g/+D/4P//////////////////"},{"a":0.66667,"d":0.77551,"p":"ND9OTT5LaXY0V3FuPHFnUlR4a1ZNZl9Q","b":"H/wf/B/8H/8f/x//H/8B/wH/Af8P/x//H//////g/+D/4P//////////////////"},{"a":0.6,"d":0.736,"p":"LTk4JVFqaEM2XG9FOl5nPVttXjk2RUQ6","b":"H8AfwB/AH8D///////////////8D/wP/H/8f+B/4//j/wP/A//////////j/+P/4"},{"a":0.6,"d":0.712,"p":"LTk4JVFqaEM2XG9FOl5nPVttXjk2RUQ6","b":"H8AfwB/AH8D///////////////8D/wP/H/8f+B/4//j/wP/A////////H/gf+B/4"},{"a":0.71429,"d":0.65714,"p":"UGhlQUhpckgsVWlAS2hkOlhoWzwuPT85","b":"//j/+P/4//////////8D+AP4A/gf+B/4H/j/+P/A/8D/wP//////////AHgAeAB4"},{"a":0.7619,"d":0.75,"p":"Ml17XTNejW8kR39jNWR4RFx4cUFbZVw3","b":"P/w//D/8P/8//z//P/8A/wD/AP8H/wf8B/w//D/gP+A/4P//////////////////"},{"a":0.7619,"d":0.73214,"p":"Ml17XTNejW8kR39jNWR4RFx4cUFbZVw3","b":"P/w//D/8P/8//z//P/8A/wD/AP8H/wf8B/w//D/gP+A/4P////////////z//P/8"},{"a":0.7619,"d":0.71429,"p":"Ml17XTNejW8kR39jNWR4RFx4cUFbZVw3","b":"P/w//D/8P/8//z//P/8A/wD/AP8H/wf8B/w//D/gP+A/4P/8//z//P/8//z//P/8"},{"a":0.7619,"d":0.75,"p":"XWxwVVZngnUnQnlyKmZ6VkN4ek44W2JI","b":"//z//P/8//////////8A/wD/AP8H/wf/B/8//z/gP+A/4D//P/8//z//P/w//D/8"},{"a":0.58333,"d":0.77679,"p":"Q2BdQ0FjcnglRHSFPmNtbFBxamFMYV5P","b":"H/wf/B/8////////////////Af8B/wH/H/8f/x///+f/5//n////////H+Af4B/g"},{"a":0.58333,"d":0.75,"p":"Q2BdQ0FjcnglRHSFPmNtbFBxamFMYV5P","b":"H/wf/B/8////////H/8f/x//Af8B/wH/H/8f/x///+f/5//n////////H+Af4B/g"},{"a":0.56,"d":0.72,"p":"LEdHOTtWX1ozSGFdO2JdQVVwWzhRX048","b":"AeAB4AHgAeD///////////////8B/wH/D/8f/B/8//j/4P/g//////////z//P/8"},{"a":0.56,"d":0.66857,"p":"LEdHOTtWX1ozSGFdO2JdQVVwWzhRX048","b":"AeAB4AHgAeAf/x//H/8f/x//D/8B/wH/D/8f/B/8//j/4P/g//////////z//P/8"},{"a":0.71429,"d":0.77143,"p":"PlhYMU1ma0I8YHRIQHB2O2iLh1tgenxi","b":"//j/+P/4//////////8D/wP/A/8D/wP4A/gf+B/4H/gf+P//////////////////"},{"a":0.71429,"d":0.71429,"p":"PlhYMU1ma0I8YHRIQHB2O2iLh1tgenxi","b":"H/gf+B/4//j/+P/4//gD/wP/A/8D/wP4A/gf+B/4H/gf+P//////////////////"},{"a":0.68,"d":0.65647,"p":"GTVDNTNecm0lSXF2JlV0YEJ1fE05WmBK","b":"B/AH8AfwB/Af/x//H/8f/x//H/8A/wD/A/8H/wf/H/8f8B/w////////H/wf/B/8"},{"a":0.64,"d":0.75,"p":"OEBCNlxqcHFHSHKCQVp6dmmMiWBPbGhK","b":"B+AH4AfgB+D//P/8//////////8A/wD/x//H/8f/////4//j////////P/w//D/8"},{"a":0.68,"d":0.62824,"p":"GTVDNTNecm0lSXF2JlV0YEJ1fE05WmBK","b":"APAA8ADwAPAf/x//H/8f/x//H/8A/wD/A/8H/wf/H/8f8B/w////////H/wf/B/8"},{"a":0.68,"d":0.64941,"p":"IT1ELEBmdV0sRWlpJ0xnT0R1eEQ5WmBE","b":"B/AH8AfwB/Af/B/8//////////8A/wD/A/8H/Af8H/wf8B/w////////H/wf/B/8"},{"a":0.68,"d":0.62824,"p":"IT1ELEBmdV0sRWlpJ0xnT0R1eEQ5WmBE","b":"B/AH8AfwB/Af/B/8H/8f/x//H/8A/wD/A/8H/Af8H/wf8B/w////////H/wf/B/8"},{"a":0.7619,"d":0.62798,"p":"NH+MQVmGkYYdMnt9ClSVN0WteidksZha","b":"B+Af/B/8P/w//D//Pn8+fzh/OH84fwH/AfwH/AfwB/Af4B/gP/A/8D//P/8/////"},{"a":0.7619,"d":0.66071,"p":"MHSWXlqAjI5BKnGENk2qYz+ViTVapJxp","b":"A/gP/g/+P/8//////n/+fzwfPB88fwH/Af4D/gP4A/gP4A/gP/4//j//P/8//z//"},{"a":0.66667,"d":0.71088,"p":"Zol9QYp8moYrN499KG2HN4q3VyehsoVa","b":"H+B//H/8//z//P///P/8//D/8P/g/wP/B/wP+B/wH/B/4H/g/+D/8P//////////"},{"a":0.7619,"d":0.64881,"p":"MHSWXlqAjI5BKnGENk2qYz+ViTVapJxp","b":"A/gP/g/+P/8//////n/+fzAfMB8wfwH/Af4D/gP4A/gP4A/gP/4//j//P/8//z//"},{"a":0.72727,"d":0.69886,"p":"IHyQVEiDjZQqPXOSIl+UV1Wbgz5ekItg","b":"A/gD+D/+P/4//z/////+f/5/AH8AfwB/Af4B/g/4D/jP+M/g//7//////////v/+"},{"a":0.72727,"d":0.6875,"p":"IHyQVEiDjZQqPXOSIl+UV1Wbgz5ekItg","b":"A/gD+A/+D/4//z/////+f/5/AH8AfwB/Af4B/g/4D/jP+M/g//7//////////v/+"},{"a":0.72727,"d":0.64489,"p":"K4uPM06GiXwhO3N4FGeULkOmhzFQnY5X","b":"B/AH8D/8P/w//z//P/8+fz5/AH8AfAB8AfwB/B/wH/Af8B/gP/w//z//P///////"},{"a":0.72727,"d":0.64773,"p":"IHOVUk6CjosuMW2KJ02fU0yVjT1ZlJdl","b":"A/gD+D/+P/4//z/////+f/5/AH8AfgB+Af4B/gP4A/gP+A/gP/4//z//P/8//z//"},{"a":0.63636,"d":0.72403,"p":"YZ13M4GCjXw4PYZ4OX6ALoWxZzGNoH5X","b":"H/Af8P/8//z////////8//j/AP8A/AD8B/wH/H/wf/B/4H/g//j/////////////"},{"a":0.69565,"d":0.58424,"p":"PICEOlV/i3YgQnxqJH6KM12peUxVeWxF","b":"AYA//D/8P/w//P5//n/+fzh/OH8B/AH8B/wH8B/wH+A/4D+AP4D///////84ADgA"},{"a":0.69565,"d":0.62772,"p":"M3yBQ053iYwgO4SIHoGKMGO1dURff2JF","b":"AMA/+D/4f/5//n//f/9//3w/fP8D/wP+D/4P+D/4P+A/4D/AP8B//3////4DAAMA"},{"a":0.72727,"d":0.6392,"p":"LXF7OUWGmXweNXt9EVyQMz+fizVVjYFZ","b":"B/AH8D/8P/w//z//P/8+fz5/GH8AfAB8AfwB/AfwB/Af8B/gP/w//z//P///////"},{"a":0.63636,"d":0.71753,"p":"WXpuOXuHm3wzNY99L3OBM3ysbjWGjHdZ","b":"H/Af8P/8//z////////8//j/cP8A/AD8B/wH/B/wH/B/4H/g//j/////////////"},{"a":0.68182,"d":0.70606,"p":"QH6GTlJ8mnshP4t5IXeDOlihejlbgHpa","b":"D/AP8D//P//////////8f/h/AH8B/wH/B/wH/A/wD/A/4D/A////////////////"},{"a":0.68182,"d":0.69394,"p":"QH6GTlJ8mnshP4t5IXeDOlihejlbgHpa","b":"D/AP8D//P/////////88fzh/AH8B/wH/B/wH/A/wD/A/4D/A////////////////"}],[{"a":0.63636,"d":0.62013,"p":"cePbVJl2yrAAVPN8ECSc4cOSq99ezMdU","b":"D/A/+H/8f/7//v7+/H54/gP+B/wH+Af8B/4AfwA/ED/4P/x//////3/+f/wf+Afg"},{"a":0.68182,"d":0.57879,"p":"WOPWPYN4vZAAVOtiDSeZwKWVqLtMysQ/","b":"D+Af+D/8f/x//n5+fH54fgH8A/wH+Af8B/4AfgB/GD/8P/w///5//n/8P/wf8AfA"},{"a":0.68182,"d":0.57879,"p":"WOHVPX91vY0AVethCyaZv6SUp7pMyMI9","b":"D+Af+D/8f/x//n5+fH54fgH8A/wH+Af8B/4AfgB/GD/8P/w///5//n/8P/wf8AfA"},{"a":0.63636,"d":0.62013,"p":"cePbVJh3yrAAVPN7ECSc4cOSq99ezMdU","b":"D/A/+H/8f/7//v7+/H54/gP+B/wH+Af8B/4AfwA/ED/4P/x//////3/+f/wf+Afg"},{"a":0.63636,"d":0.61688,"p":"ceXcU516yrIAVfN8EyWc4MWTq99ezshU","b":"D/A/+H/8f/7//v7+/H54/gP+B/wH+Af8B/4AfwA/ED/4P/x//////3/+P/wf+Afg"},{"a":0.7619,"d":0.75893,"p":"Mlt1XjFhjW4kVIxpMU52ZkZcalVCUlpB","b":"P/8//z//P/8//z//P/8H/Af8B/wH/Af8B/w//zj/OP84////////////P/w//D/8"},{"a":0.71429,"d":0.77143,"p":"X3JrPV9/gUwyb4NNM1x/XERgfGY0T2FE","b":"//j/+P/4//j/+P/4//gf+B/4H/gf+B/4H/j//+P/4//j//////////////j/+P/4"},{"a":0.7619,"d":0.74107,"p":"OWFsUTtofmQmUnxVMUN/YElWdmM+TlhD","b":"P/w//D/8P/8//z//P/8H/Af8B/wH/Af8B/w//zj/OP84////////////P/w//D/8"},{"a":0.7619,"d":0.8125,"p":"SGhpRlBxe2QoVnpyOUV1hFFRbXo4QkhB","b":"P/w//D/8//////////8H/wf/B/8H/wf/B/////j/+P/4////////////P/w//D/8"},{"a":0.71429,"d":0.74286,"p":"X3JrPV9/gUwyb4NNM1x/XERgfGY0T2FE","b":"//j/+P/4//j/+P/4//gf+B/4H/gf+B/4H/j//+P/4//j////////////H/gf+B/4"},{"a":0.7619,"d":0.78571,"p":"SGhpRlBxe2QoVnpyOUV1hFFRbXo4QkhB","b":"P/w//D/8//////////8H/wf/B/8H/wf/B/////j/+P/4////////////B/wH/Af8"},{"a":0.66667,"d":0.83673,"p":"OU9VST5ba28xVXF9NU5wgEFQZHA6SU1L","b":"//z//P/8//////////8f/x//H/8f/x//H/8P/wH/Af8B//////////////z//P/8"},{"a":0.66667,"d":0.77551,"p":"OU9VST5ba28xVXF9NU5wgEFQZHA6SU1L","b":"H/wf/B/8//////////8f/x//H/8f/x//H/8P/wH/Af8B////////////H/wf/B/8"},{"a":0.7619,"d":0.67857,"p":"MV9jQzVoe2AkVYJaKECEXzxPe2ZIW2hT","b":"P+A/4D/gP/w//D/8P/w//D/8P/w//Af8B/wH/AD8APwA/P//////////P/w//D/8"},{"a":0.7619,"d":0.73214,"p":"OWJkNk5ufF00WH5uM0V4fEpIaXhDTlVK","b":"P/w//D/8P/w//D/8P/wH/wf/B/8H/wf/B/8H/wD/AP8A////////////P/w//D/8"},{"a":0.66667,"d":0.7551,"p":"UmZgQ1d0eWA9aYBaNlWDX0lce2ZUYWZT","b":"/+D/4P/g//j//P/8//z//P/8//z//B/8H/wP/AH8AfwB/P////////////z//P/8"},{"a":0.66667,"d":0.81633,"p":"QFlbT0hobGQ3W25uMk1oeUVZaXNCUllO","b":"//z//P/8//////////8f/B/8H/wf/x//H/////A/8D/wP/////////////z//P/8"},{"a":0.66667,"d":0.7551,"p":"QFlbT0hobGQ3W25uMk1oeUVZaXNCUllO","b":"H/wf/B/8//////////8f/B/8H/wf/x//H/8P/wA/AD8AP/////////////z//P/8"},{"a":0.7619,"d":0.75,"p":"KE5fTzZjfnctWIF5LUF2ek5bfX9SXG5g","b":"P/w//D/8P/8//z//P/8H/wf/B/8H/wf/B/8H/wD/AP8A////////////P/w//D/8"},{"a":0.7619,"d":0.72321,"p":"KE5fTzZjfnctWIF5LUF2ek5bfX9SXG5g","b":"B/wH/Af8P/8//z//P/8H/wf/B/8H/wf/B/8H/wD/AP8A////////////P/w//D/8"},{"a":0.7619,"d":0.75893,"p":"NUBIPUxZZWIzU25tMTxrcFNWbmxDWV9J","b":"OPw4/Dj8//////////8H/wf/B/8H/wf/B//H/8D/wP/A////////////P/w//D/8"},{"a":0.7619,"d":0.73214,"p":"NUBIPUxZZWIzU25tMTxrcFNWbmxDWV9J","b":"APwA/AD8//////////8H/wf/B/8H/wf/B//H/8D/wP/A////////////P/w//D/8"},{"a":0.66667,"d":0.67188,"p":"JERGNTlfcWQlV35iLkeAdk5edGYyQEUx","b":"P+A/4D/gP/w//D/8P/8//z//B/wH/Af8AP8A/wD/////////P/w//D/8B+AH4Afg"},{"a":0.66667,"d":0.64844,"p":"JERGNTlfcWQlV35iLkeAdk5edGYyQEUx","b":"B+AH4AfgP/w//D/8P/8//z//B/wH/Af8AP8A/wD/////////P/w//D/8B+AH4Afg"},{"a":0.71429,"d":0.74286,"p":"Q1FWN0dmdkg4ZXpOOlluT1RlcFpOXGFS","b":"//j/+P/4//////////8f+B/4H/gf+B/4H/gf/wB/AH8Af/////////////j/+P/4"},{"a":0.71429,"d":0.82857,"p":"PU5UMUhofEo6bIVULl5+WU1ogm9LYnVp","b":"H/gf+B/4/////////////////////x/4H/gf/wP/A/8D////////////////////"},{"a":0.71429,"d":0.8,"p":"PU5UMUhofEo6bIVULl5+WU1ogm9LYnVp","b":"H/gf+B/4//j/+P/4//j//////////x/4H/gf/wP/A/8D////////////////////"},{"a":0.7619,"d":0.75893,"p":"QUtOOUhgc14tUnx2IUF5fzxdeoM9Xm1e","b":"P/w//D/8//z//P/8//w//z//P/8//wf/B/8H/wD/AP8A/z//P/8//z//P/w//D/8"},{"a":0.58333,"d":0.71429,"p":"UVtMOlNnbGs2XXx8N11/b1psfWdRZlo6","b":"H+Af4B/g////////////////H/8f/x//AfwB/AH88f/x//H///z//P/8H+Af4B/g"},{"a":0.70833,"d":0.61765,"p":"KEJIN0VgcGoiSW9fJ0RpdUFTZW8iMzsz","b":"H/Af8B/wH/wf/B/8H/8f/x//B/wH/Af8AP8A/wD//P/8//z/H/wf/B/8B/AH8Afw"},{"a":0.80952,"d":0.63025,"p":"KEJIN0RgbWQuUXJnGkBqZTlPbHxAUmBn","b":"B/AH8AfwH/wf/B/8H/wf/x//H/8f/wf8B/wD/wD/AP8A//z//P/8////H/wf/B/8"},{"a":0.63636,"d":0.68506,"p":"V46NTGhyi3kqUZBiHi16k2RfdIdWhnpG","b":"f/B/8H/8f/z////////8////B/wH/Af8B/8H/wA/AD/4P/w//////3/8f/wf8B/w"},{"a":0.72727,"d":0.60511,"p":"MYKkZUhdiYIkPZaAPDFVj2Rsa5EsYnhO","b":"D/gP+D/+P/4//z5/Pn8Mfw3/Af4D/gP+AH8AfwwfDB/+H/4f//8//z//D/4D4APg"},{"a":0.58333,"d":0.67262,"p":"QHNyQGN4pnoVVap5HzF5i2dtf4QmVlk4","b":"D+AP4D/+P/7//v/+/P/8/wD+D/4P/g/+D/4A/wD/+D/4P/z//////z/+P/4H4Afg"},{"a":0.68182,"d":0.65152,"p":"UX16NmB/oV8dT5xVFzaAbFJXenZUdXpE","b":"H+Af4H/4f/j//v/+//78fv/+B/4H+Af4B/4H/gB+AH74f/x//////n/+f/4f+B/4"},{"a":0.68182,"d":0.64545,"p":"UX16NmB/oV8dT5xVFzaAbFJXenZUdXpE","b":"H+Af4H/4f/j//v/+//58fn/+B/4H+Af4B/4H/gB+AH74f/x//////n/+f/4f+B/4"},{"a":0.68182,"d":0.63939,"p":"UX16NmB/oV8dT5xVFzaAbFJXenZUdXpE","b":"H+Af4H/4f/j//v/+//58fn/+B/4H+Af4B/4H/gB+AH54f3x//////n/+f/4f+B/4"}],[{"a":0.71429,"d":0.59048,"p":"AB/XTQCC/k5RxttQzp3Ver6+8coAAMdQ","b":"APgA/AD8AfwD/AP8B/wP/B/8H/w//H78fvz8/Pz8/////////////wD8APwA/AD8"},{"a":0.71429,"d":0.59048,"p":"AB/YUACB/lNRx9xTzZ3VfL6+8csAAMdT","b":"APgA/AD8AfwD/AP8B/wP/B/8H/w//H78fvz8/Pz8/////////////wD8APwA/AD8"},{"a":0.7619,"d":0.55357,"p":"ABXjMwCA/jU12t81saDeXK2+9KoAANM0","b":"AHgA+AH4AfgD+Af4B/gH+A/4H/gf+D74fvh8+Hz4/////////////wD4APgA+AD4"},{"a":0.7619,"d":0.5625,"p":"AAnPTQBj/k4f39JQkrXKepW+7coAALlQ","b":"AHgAfAD8AfwB/AP8A/wH/A/8D/wf/D98Pnx+fHx8//////////9//wB8AHwAfAB8"},{"a":0.7619,"d":0.55357,"p":"ABXiMwCB/jM12eA1sqDfXK2+9KgAANQ1","b":"AHgA+AH4AfgD+Af4B/gH+A/4H/gf+D74fvh8+Hz4/////////////wD4APgA+AD4"},{"a":0.71429,"d":0.59048,"p":"AB/XTQCC/k5Rx9tPzp3Ver6+8coAAMdQ","b":"APgA/AD8AfwD/AP8B/wP/B/8H/w//H78fvz8/Pz8/////////////wD8APwA/AD8"},{"a":0.7619,"d":0.76786,"p":"GDhtXzRllYRLgq2KUYCrjUVah3UrLFpK","b":"B/wH/Af8B/8H/wf/B/8//z//P////////////////////z//P/8//z//APwA/AD8"},{"a":0.7619,"d":0.74107,"p":"GDhtXzRllYRLgq2KUYCrjUVah3UrLFpK","b":"APwA/AD8B/8H/wf/B/8//z//P////////////////////z//P/8//z//APwA/AD8"},{"a":0.80952,"d":0.62185,"p":"IUdXNDZpdUFWiI1QYYmPWEFicFMfMEw4","b":"AfgB+AH4B/gP+A/4D/g/+D/4P/g/+D/4P/j//////////z/4P/g/+D/4AfgB+AH4"},{"a":0.7619,"d":0.72321,"p":"HztTTzFeempKfJd/WH+YjD9bdHYeL05L","b":"APwA/AD8B/8H/wf/B/8//z//P/8//z//P////////////z//P/8//z//APwA/AD8"},{"a":0.80952,"d":0.62185,"p":"GC5MMSRQflBCdJlfVoKdZl5/lnA1Untl","b":"AfgB+AH4B/gP+A/4D/gP+A/4D/g/+D/4P/j//////////z//P/8//z//AfgB+AH4"},{"a":0.64,"d":0.555,"p":"ICo3MzZTa2BDcYh8UXWMikNacnkfLDo9","b":"ABwAHAAcABwA/AD8B/8H/wf/P/8//z//P/8//z//////////APwA/AD8ABwAHAAc"},{"a":0.72727,"d":0.60511,"p":"HiMuLC5FW1FFa4N5THmPhlJuh4w5T2Vq","b":"ABwAHAAcABwA/AD8APwH/wf/B/8H/z//P/8//z//P/8/////////////APwA/AD8"},{"a":0.88889,"d":0.69792,"p":"LEZeUUdnf3dBeY5/V3mQjU9ngYsyR1xg","b":"APwA/AD8APwH/wf/B/8H/z//P/8//z//P/8//z//P////////////wD8APwA/AD8"},{"a":0.77273,"d":0.60963,"p":"CxwnIRNAWkYva4NlSn+MbExzgW4vT2Bd","b":"APAA8ADwAPAD/Af8B/wH/wf/B/8H/x//H/8f///8//z//P//////////APwA/AD8"},{"a":0.94444,"d":0.70588,"p":"Dj9fSSllgGI/fo5wVYCLaUVqe3IoRldW","b":"B/wH/Af8B/wH/wf/B/8H/x//H/8f/x////z//P/8//z//////////wD8APwA/AD8"},{"a":0.80952,"d":0.64706,"p":"FztbOzBab0dId3tLW42WYFN9mGsiNF1I","b":"AfgB+AH4B/gP+A/4D/g/+D/4P/g/+D/4P/j//////////z//P/8//z//AfgB+AH4"},{"a":0.7619,"d":0.70536,"p":"CyheSx5Lh249d6mFVIiuk1p4log0PmFP","b":"APwA/AD8B/wH/Af8B/w//D/8P/w//z//P///////////////////////APwA/AD8"},{"a":0.7619,"d":0.72321,"p":"IjVPOTZfclBXiI5gcpKWcG18g3I1OVNG","b":"APwA/AD8B/wH/Af8B/w//z//P//////8//z/////////////////////APwA/AD8"},{"a":0.7619,"d":0.69643,"p":"JzRNTDdce3NJgJWBW4eVglBnfYMhLVlW","b":"APwA/AD8B/8H/wf/B/8H/wf/B/8//z//P////////////z//P/8//z//APwA/AD8"},{"a":0.7619,"d":0.6875,"p":"DyhFOB9Lb1pCdYljVISNZlNvg3cyRGVc","b":"APwA/AD8B/wH/Af8B/w//D/8P/w//D/8P/z/////////////////////APwA/AD8"},{"a":0.64,"d":0.6075,"p":"DyM+MhlHeWA5bYZlW4iQcl16mYcuOFRK","b":"AOAA4ADgAOAH/Af8B/wH/Af8P/w//D/8//z//P/8////////B/8H/wf/APwA/AD8"},{"a":0.88889,"d":0.73958,"p":"DztuVSpbiXJEeYRdXYuObWyRpJRGV4dz","b":"B/wH/Af8B/wH/Af8B/wH/D/8P/w//D/8//z//P/8//z//////////wf/B/8H/wf/"},{"a":0.72727,"d":0.58523,"p":"AiJtMw9cqU01n65IepSjU2iApXAXFWRF","b":"APgA+AD4APgD+AP4D/gP+A/4D/g/+D/4f/h/+H/+f/7///////9//wD5APkA+QD5"},{"a":0.77273,"d":0.59091,"p":"AC1iMQ1sqkw3lrVRdpezal1/qHUMLWxK","b":"AfgB+AH4AfgD+Af4B/gP+B/4H/gf+B/4f/h/+H/+f/7///////9//wH4AfgB+AH4"},{"a":0.77273,"d":0.58021,"p":"AC1iMQ1sqkw3lrVRdpezal1/qHUMLWxK","b":"AfAB8AH4AfgD+Af4B/gP+B/4H/gf+B/4f/h/+H/+f/7///////9//wH4AfgB+AH4"},{"a":0.72727,"d":0.65625,"p":"CyF0UBlcq24viqJ0gaGfkXB/npUMF1BJ","b":"AH4AfgH+Af4D/gP+D/4P/g/+D/4//j/+Pn4+fv///////////////wB+AH4AfgB+"}],[{"a":0.63636,"d":0.68506,"p":"dt/fnq/NiUjZ9+91QiCI6cWFs8500cFE","b":"P/4//j/+f/5//n/+fgB/8P/4//z//v/+/H8APwA/AD/wP/h//////v/+f/w/+A/g"},{"a":0.63636,"d":0.67208,"p":"X+DftJHcj1i6+vWQOCVo/a+TnOhYycxZ","b":"H/4//z//P/8//3/+fgB/8H/4f/x//n///H8APwA/AD/4P/w//////3/+P/wf+Afg"},{"a":0.63636,"d":0.68506,"p":"d+PjoK/QiknZ+PB1RCGI6caHss5z1MNF","b":"P/4//j/+f/5//n/+fgB/8P/4//z//v/+/H8APwA/AD/wP/h//////v/+f/w/+A/g"},{"a":0.63636,"d":0.67208,"p":"YOPjuJDfkFm6+vWQOihn/bCUnOhZzM5Y","b":"H/4//z//P/8//3/+fgB/8H/4f/x//n///H8APwA/AD/4P/w//////3/+P/wf+Afg"},{"a":0.63636,"d":0.68506,"p":"dt/fnq/Oh0fZ9+10QiCI6cWFs8500cFE","b":"P/4//j/+f/5//n/+fgB/8P/4//z//v/+/H8APwA/AD/wP/h//////v/+f/w/+A/g"},{"a":0.63636,"d":0.67208,"p":"X+DftJHdjla7+vOPOCVo/a+TnOhYycxZ","b":"H/4//z//P/8//3/+fgB/8H/4f/x//n///H8APwA/AD/4P/w//////3/+P/wf+Afg"},{"a":0.70833,"d":0.76471,"p":"RFZbOWhzc0dtdXNLP1RgVVBcaV08S1VB","b":"D/8P/w////////////j/+P/4////////AD8APwA/P/8//z//////////D+AP4A/g"},{"a":0.70833,"d":0.74265,"p":"RFZbOWhzc0dtdXNLP1RgVVBcaV08S1VB","b":"D/gP+A/4//////////j/+P/4////////AD8APwA/P/8//z//////////D+AP4A/g"},{"a":0.70833,"d":0.72059,"p":"RFZbOWhzc0dtdXNLP1RgVVBcaV08S1VB","b":"D/gP+A/4//j/+P/4//j/+P/4////////AD8APwA/P/8//z//////////D+AP4A/g"},{"a":0.64,"d":0.8025,"p":"M0xZVmN3fXB9iYh6ZGRyjlRTZIU6TFpU","b":"B/wH/Af8B/w//z/////////////////////H/8f/////H/8fP/8//z//B/wH/Af8"},{"a":0.66667,"d":0.87755,"p":"V3BoWGKGfWVPdoaAO055jU1ic3dMY15H","b":"//z//P/8//z//P/8//z///////////////////A/8D/wP/////////////z//P/8"},{"a":0.66667,"d":0.81633,"p":"V3BoWGKGfWVPdoaAO055jU1ic3dMY15H","b":"//z//P/8//z//P/8//z//////////x//H/8P/wA/AD8AP/////////////z//P/8"},{"a":0.71429,"d":0.77143,"p":"XW1eMYCPcDeAl4NKYmh8XWd0gW1ccHRZ","b":"//j/+P/4//j/+P/4//j/+P/4//j/+P/4//j//wB/AH8Af/////////////j/+P/4"},{"a":0.66667,"d":0.72656,"p":"J01RRkBzeWY+bHp0Q1ZveU9jaWo3REEz","b":"B/wH/Af8P/8//z//P/w//D/8P/8//z//AP8A/wD/P/8//z//////////B+AH4Afg"},{"a":0.625,"d":0.725,"p":"TFhHI4KUdTtzkIJIUlpzWlFocV0vQ0kz","b":"//j/+P/4//j/+P/4//j/+P/4//j/+P/4AH8AfwB///////////j/+P/4H8AfwB/A"},{"a":0.625,"d":0.675,"p":"TFhHI4KUdTtzkIJIUlpzWlFocV0vQ0kz","b":"/8D/wP/A//j/+P/4//j/+P/4//j/+P/4AH8AfwB///////////j/+P/4A8ADwAPA"},{"a":0.71429,"d":0.8,"p":"YXZyQ3GHg09ldnNNV1piUVFXXFFHUVFG","b":"////////////+P/4//j/+P/4//j//////////wB/AH8Af///////////H/gf+B/4"},{"a":0.71429,"d":0.77143,"p":"YXZyQ3GHg09ldnNNV1piUVFXXFFHUVFG","b":"//j/+P/4//j/+P/4//j/+P/4//j//////////wB/AH8Af///////////H/gf+B/4"},{"a":0.71429,"d":0.85714,"p":"RlZOMmF3bkVthoBRVmJtWEZTXFhCU1VN","b":"H/8f/x//////////////+P/4//j//////////wB/AH8Af///////////////////"},{"a":0.71429,"d":0.82857,"p":"RlZOMmF3bkVthoBRVmJtWEZTXFhCU1VN","b":"H/gf+B/4////////////+P/4//j//////////wB/AH8Af///////////////////"},{"a":0.625,"d":0.75,"p":"VnNuP3eNdTx4hmc1TlprVFZtcl1GYlo6","b":"H/gf+B/4//j/+P/4//j/+P/4//j/+P/44//j/+P//n/+f/5/////////H8AfwB/A"},{"a":0.71429,"d":0.8,"p":"ZXpnOn2UfEJlg35OR1ttVVJkaFtPX1lA","b":"//j/+P/4//j/+P/4//j/+P/4//j//////////+B/4H/gf///////////H/gf+B/4"},{"a":0.7619,"d":0.8125,"p":"OnNtWk2OfGdCfIF8OVZ3gk9hdWxFXWBB","b":"P/w//D/8P/w//D/8P/w//z//P/8//z//P/8//zj/OP84////////////P/w//D/8"},{"a":0.7619,"d":0.80357,"p":"NGdjVEyDc2dJeIV/P1J/kVZujYdQbYBe","b":"P/w//D/8P/8//z//P/8//z//P/8//z//P/8//wD/AP8A////////////P/w//D/8"},{"a":0.64,"d":0.6825,"p":"Iz1EPUR2dWRId3VeR2duXk5eam5IVF9T","b":"BwAHAAcABwA//z//P/8//z//P/8//D/8P/8//z//P/84Hzgf////////B/wH/Af8"},{"a":0.7619,"d":0.77679,"p":"QnN0ZEp+eGRFbHJZSWFpZU9lcWxGT1pO","b":"P/8//z//P/8//z//P/8//D/8P/w//z//P/8//zgfOB84H///////////B/wH/Af8"},{"a":0.68,"d":0.74118,"p":"O1JFJHKUg0l9l41WX3R/ZVNZbW88TWFM","b":"D/gP+A/4D/g//z//////+P/4//j/+P/4//8//z//P/84Pzg/////////D/gP+A/4"},{"a":0.68,"d":0.69176,"p":"O1JFJHKUg0l9l41WX3R/ZVNZbW88TWFM","b":"D+AP4A/gD+A/+D/4//j/+P/4//j/+P/4//8//z//P/84Pzg/////////D/gP+A/4"},{"a":0.72727,"d":0.73864,"p":"OIOHSF2SaT1poYRGLkONekRRhnRHk4pJ","b":"D/4P/j/+P/4//j/+P/4+AP/4//j//v/+//7//gB/AH/4f/h+//7//v/+//4/+D/4"},{"a":0.72727,"d":0.72727,"p":"OIOHSF2SaT1poYRGLkONekRRhnRHk4pJ","b":"D/4P/j/+P/4//j/+P/4+AP/4//j//v/+P/4//gB/AH/4f/h+//7//v/+//4/+D/4"},{"a":0.72727,"d":0.71591,"p":"OIOHSF2SaT1poYRGLkONekRRhnRHk4pJ","b":"D/4P/j/+P/4//j/+P/4+AP/4//j//v/+P/4//gB/AH/4f/h+//7//j/+P/4/+D/4"},{"a":0.77273,"d":0.68717,"p":"LXWNZ1GUck9doJBbKzxoj0dTapNDgpRf","b":"D/4P/h/+H/6f/p/+n/6fwJ/4n/h//n/+H/4f/gB/AH8Yfxx/f////p/+n/6P+I/4"},{"a":0.63636,"d":0.72403,"p":"RpSbeV6neU5ur512KDdhm0xeaotFfYRc","b":"P/8//z//P/8//z//P/8/4D/+P/7/////PD88PwA/AD/4P/w//////z/+P/4f+B/4"},{"a":0.63636,"d":0.71753,"p":"RpSbeV6neU5ur512KDdhm0xeaotFfYRc","b":"P/8//z//P/8//z/+P/4/4D/+P/7/////PD88PwA/AD/4P/w//////z/+P/4f+B/4"},{"a":0.58333,"d":0.6875,"p":"OnF4Tnele2GCnI6BPD12mmBxi40sWlsy","b":"D/4P/j/+P/7//v/+/wD/AP/4//////////8APwA/OD84P/z///7//j/4P/gHAAcA"},{"a":0.58333,"d":0.6756,"p":"OnF4Tnele2GCnI6BPD12mmBxi40sWlsy","b":"D/gP+D/+P/7//v/+/wD/AP/4//////////8APwA/OD84P/z///7//j/4P/gHAAcA"},{"a":0.63636,"d":0.74675,"p":"TX12XIGhdE+SnXtPST9/iFNRd3tohHNC","b":"f/x//H//f/9//3/8//j/AP/4//z//P/8/P/8/wA/AD/4P/w////////8//x/8H/w"},{"a":0.72727,"d":0.68466,"p":"FmB3XzaQhVpGl4hmP0RLnk5TVZEtboFW","b":"D/4P/g//D/8P/w//P/8/gD/+P/4//z//Pn8+fwAfAB/+H/4f//8//z/+P/4P+A/4"},{"a":0.63636,"d":0.72727,"p":"TX12XIGhdE+SnXtPST9/iFNRd3tohHNC","b":"H/wf/H//f/9//3/8//j/AP/4//z//P/8/P/8/wA/AD94P3w////////8//x/8H/w"},{"a":0.72727,"d":0.6733,"p":"FmB3XzaQhVpGl4hmP0RLnk5TVZEtboFW","b":"A/4D/g//D/8P/w//P/8/gD/+P/4//z//Pn8+fwAfAB/+H/4f//8//z/+P/4P+A/4"}],[{"a":0.63636,"d":0.72403,"p":"R8/qesi3ioXy5uB18pFq+MW9mek+vc9g","b":"B/gf/D/+f/5//39//h/98P/4//z//v/+/n/8P/w//D/8P/4/f/9//3/+P/4f+Afg"},{"a":0.68182,"d":0.68182,"p":"MMnlXqaziHDL595aypRt26O8ncwsuMpN","b":"B/AP/B/8P/5//n5+fj5/+H/4f/j//P/+/37+P34/fj9+P34/f/9//j/+H/wP+APg"},{"a":0.63636,"d":0.72403,"p":"R9Dresa5jYny5uF18pFp+MS9mek+v9Fg","b":"B/gf/D/+f/5//39//h/98P/4//z//v/+/n/8P/w//D/8P/4/f/9//3/+P/4f+Afg"},{"a":0.72727,"d":0.64489,"p":"EL/xX2bMhXOL6OpZlLlJ22/VhcwOr9dN","b":"A/AH/A/8H/4//j8+Ph4/8D/4P/h//H/+fz5+H74fvh++H78/v/8//h/+D/wH+AHg"},{"a":0.68182,"d":0.67576,"p":"MMrmX6a3jHPL6eBZyZRt26O8ncwrucxN","b":"B/AP/B/8P/5//n4+fj5/8H/4f/j//P/+/37+P34/fj9+P34/f/9//j/+H/wP+APg"},{"a":0.68182,"d":0.68485,"p":"R9beRsekjlzy5tRF8nSHwMWnra8+xL8z","b":"B/Af+D/8f/x//n5+/D794P/4//j//P/8/v78fvx//H/8f/x/f/5//n/8P/wf8AfA"},{"a":0.63636,"d":0.72403,"p":"R8/qese3ioXy5uB18pFq+MW9mek+vc9g","b":"B/gf/D/+f/5//39//h/98P/4//z//v/+/n/8P/w//D/8P/4/f/9//3/+P/4f+Afg"},{"a":0.68182,"d":0.67879,"p":"MMnlXqazhXHL5ttaypRt26O8ncwsuMpN","b":"B/AP/B/8P/5//n4+fj5/+H/4f/j//P/+/37+P34/fj9+P34/f/9//j/+H/wP+APg"},{"a":0.7619,"d":0.89286,"p":"O2tyUlGFhXJYi4B3XoR5gV+Bf3pIaHBU","b":"P/w//D/8P/8//z//P////////////////////////////z//P/8//z//P/w//D/8"},{"a":0.7619,"d":0.875,"p":"O2tyUlGFhXJYi4B3XoR5gV+Bf3pIaHBU","b":"P/w//D/8P/8//z//P/8//z//P////////////////////z//P/8//z//P/w//D/8"},{"a":0.71429,"d":0.82857,"p":"TGJZLWuGdjqBnYhFhY19VHeEeFxYaWBP","b":"H/gf+B/4////////////+P/4//j/+P/4//j///5//n/+f/////////////j/+P/4"},{"a":0.7619,"d":0.875,"p":"MVlTOUx9eFJelZVnaJGGfGeDeHNMY2JO","b":"P/w//D/8P/w//D/8P/z//P/8//z/////////////////////////////P/w//D/8"},{"a":0.71429,"d":0.8,"p":"TGJZLWuGdjqBnYhFhY19VHeEeFxYaWBP","b":"H/gf+B/4//j/+P/4//j/+P/4//j/+P/4//j///5//n/+f/////////////j/+P/4"},{"a":0.64,"d":0.7725,"p":"Kz4+JlVpaExrgoZrfYSDfm11bno+V2RT","b":"AOAA4ADgAOA//D/8P/8//z//////////////////////////////////B/wH/Af8"},{"a":0.68,"d":0.75529,"p":"MT08IniDdkmOnoZVf5d+W2Z5al9KVllM","b":"AeAB4AHgAeD/////////////////+P/4//////////8/Pz8/////////D/gP+A/4"},{"a":0.80952,"d":0.84034,"p":"c35yRo2bhFWInoVYdo51XmJybF1GUVRI","b":"//j/+P/4////////////+P/4//j//////////z8/Pz8/P///////////D/gP+A/4"},{"a":0.65217,"d":0.75362,"p":"NXN9THGTi2uNnohXjnhwiWyHjoguYWtE","b":"B/A//D/8P/8///9//3/////w//z////////8f/x//H/+f/9//38//z//P/wHwAfA"}],[{"a":0.71429,"d":0.47937,"p":"vOPiuGV84JUAUsALAJR7AAnPOwAj2yYA","b":"f/7////////////+APwB/AH4A/AD8APgB+AHwAfAD8APwA+AH4AfgB+AH4AfgB+A"},{"a":0.66667,"d":0.5034,"p":"2d/f1nZ56bcASdEaAJx8ACnnKwA+/AwA","b":"////////////////AH4A/AH4AfgD8AfwB+AP4A/gD+AfgB+AH4AfgB+AH4AfAB8A"},{"a":0.71429,"d":0.57143,"p":"XXN5SFl4gUwyWWExPVVMJU1OMSc7NyEo","b":"//////////////////8D+AP4A/gf+B/AH8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/A"},{"a":0.7619,"d":0.55357,"p":"S2F1c0xlenI4UmFIQFlYOT5RSCosNi0Z","b":"//////////////////8A/AD8APwH/AfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4Afg"},{"a":0.71429,"d":0.54286,"p":"XXN5SFl4gUwyWWExPVVMJU1OMSc7NyEo","b":"//////////////////8D+AP4A/gf+B/AH8AfwB/AH8AfwB/AH8AfwB+AHgAeAB4A"},{"a":0.83333,"d":0.56667,"p":"WW50RWeAiFIwX2w8NFJVJkZYQiRQSywo","b":"//j/+P/4//j//////////wP4A/gD+AP4H8AfwB/AH8AfwB/AH8AfwB/AH8AfwB/A"},{"a":0.88889,"d":0.58333,"p":"SF5yb1VtgX0yTmhSP1ZbPkJbVjQ9TkQn","b":"/////////////////////wD8APwA/AD8B+AH4AfgB+AH4AfgB+AH4AfgB+AH4Afg"},{"a":0.66667,"d":0.68367,"p":"YXJrV191cl03UVZAPVBEK05PMh1BPSUU","b":"//////////////////8f/B/8H/wf+B/gH+Af4B/gH+Af4P/g/+D/4P/g/+D/4P/g"},{"a":0.66667,"d":0.65306,"p":"YXJrV191cl03UVZAPVBEK05PMh1BPSUU","b":"//////////////////8f/B/8H/wf+B/gH+Af4B/gH+Af4P/g/+D/4P/A/gD+AP4A"},{"a":0.57143,"d":0.67857,"p":"XnV/bVt3jHklTmZQKU1KLURNMhw8Pyca","b":"//////////////////8A/wD/AP8P/w/wD/AP8A/wD/AP8P/w//D/8P/w/wD/AP8A"},{"a":0.57143,"d":0.64286,"p":"XnV/bVt3jHklTmZQKU1KLURNMhw8Pyca","b":"//////////////////8A/wD/AP8P/w/wD/AP8A/wD/AP8P8A/wD/AP8A/wD/AP8A"},{"a":0.64,"d":0.51,"p":"MlxyUzlkgmQlSmJDKkk4ITVLKyUyQCsr","b":"P/w//D/8P/z///////8H/Af8B/wH4AfgB+AH4AfgP+A/AD8APwA/AD8ABwAHAAcA"},{"a":0.56,"d":0.56571,"p":"TmhvU1Ryf2Q0Wl5DPkoyIUtFJiVBOyYr","b":"//z//P/8//z///////8f/B/8H/gf4B/gH+Af4B/g/8D+AP4A/gD+AP4AHgAeAB4A"},{"a":0.64,"d":0.555,"p":"MkJKQUVfalc8YndXN1JbPThKQSgmOi4X","b":"B/wH/Af8B/z///////////////8H4AfgB+AH4AfgB+AH4AfgP+A/4D/gBwAHAAcA"},{"a":0.72727,"d":0.57955,"p":"LjxEPD9WYFBEZnhbNVdnRztOTTMzSD0k","b":"B/wH/Af8B/z//////////////////wfgB+AH4AfgB+AH4AfgB+AH4AfgB+AH4Afg"},{"a":0.66667,"d":0.57143,"p":"MVNzdCZKcnMcO1hGJz9CKD1WPiI+VDQf","b":"//////////8//z//P/8H+Af4B/gH+Af4B/gH+Af4B/gH+D+AP4A/gD+AP4A/gD+A"},{"a":0.57143,"d":0.64286,"p":"RGJ5cjdeeXEoTlw/OEZBIFhUNxtZUCoc","b":"//////////////////8P8A/wD/AP8A/wD/AP8A/wD/AP8P8A/wD/AP8A/wD/AP8A"},{"a":0.7619,"d":0.54464,"p":"Mk5eTjJbgWIgSW9FIkZMKDVQMyc7SyYm","b":"P/w//D/8//////////8A/AD8APwH/AfgB+AH4AfgB+AH4D/gP+A/4D/gPwA/AD8A"},{"a":0.66667,"d":0.60204,"p":"RFddTkhsf2IwXmlFN1BDKE9LLCdNQSIm","b":"//z//P/8//////////8B/AH8AfwP+B/gH+Af4B/gH+Af4P/g/+D/4P/A/gD+AP4A"},{"a":0.66667,"d":0.57143,"p":"RFddTkhsf2IwXmlFN1BDKE9LLCdNQSIm","b":"//z//P/8//////////8B/AH8AfwP+B/gH+Af4B/gH+Af4P4A/gD+AP4A/gD+AP4A"},{"a":0.56,"d":0.61714,"p":"KzpCM0Fgclc3XGxPP05HQElGLy80KhoY","b":"//z//P/8//z///////8f/B/8H/wf/B/8H/gf4B/gH+Af4B/g/+D/4P/gHgAeAB4A"},{"a":0.63636,"d":0.63312,"p":"JzI3LDtVZUxAYnRZN1FTQ0dMOjtGQCoo","b":"H/wf/B/8H/z//////////x/8H/wf/B/8H/wf/B/gH+Af4B/gH+Af4P/g/+D/4P/g"},{"a":0.63636,"d":0.49675,"p":"JzI3LDtVZUxAYnRZN1FTQ0dMOjtGQCoo","b":"AeAB4AHgAeAP/x//H/8f/x/8H/wf/B/8H/wf/B/gH+Af4B/gH+Af4P/A/gD+AP4A"},{"a":0.7619,"d":0.5625,"p":"MWOGcixgiGwbQVQ2LE1CJDhYNSg4QyUk","b":"//////////8//z//P/8H/Af8B/wH/AfgB+AH4AfgB+AH4D8APwA/AD8APwA/AD8A"},{"a":0.66667,"d":0.62245,"p":"UHOFckpzhmwsT1A2RU86JFZSLShFPCIk","b":"//////////////////8f/B/8H/wf+B/gH+Af4B/gH+Af4P4A/gD+AP4A/gD+AP4A"},{"a":0.80952,"d":0.55462,"p":"VF5oQ0dPbkMuRV81LkdKJkFGMyI6Oici","b":"///////////////////B+MH4wfjH+A/gD+AP4A/gD+AP4A/gD+AP4A/gD+AP4A/g"},{"a":0.66667,"d":0.58163,"p":"VVhpY0pCaGoyNF1aLT9RQT9IQyc5PTMf","b":"///////////////////gf+B/4H/D/wf4B/gH+Af4B/gH+Af4B/gH+AfwB4AHgAeA"},{"a":0.66667,"d":0.56122,"p":"TWduTkNleFY0WWdJO1JNREdONzZAPikd","b":"//////////////////8B/AH8AfwP+B/gH+Af4B/gH+Af4B/gH+Af4B/AHgAeAB4A"},{"a":0.66667,"d":0.54082,"p":"TWduTkNleFY0WWdJO1JNREdONzZAPikd","b":"//z//P/8//////////8B/AH8AfwP+B/gH+Af4B/gH+Af4B/gH+Af4B/AHgAeAB4A"},{"a":0.72727,"d":0.51989,"p":"XneLeExlrpMgMZpKNV6AETN0WREZTC0P","b":"f/9//////////3//f/8A/wD/APwD8APwA/AD8AfAB8AHwAfAB8AHwAfAB8AHwAfA"},{"a":0.72727,"d":0.50852,"p":"XneLeExlrpMgMZpKNV6AETN0WREZTC0P","b":"f/9//////////3//f/8A/wD/APwD8APwA/AD8AfAB8AHwAfAB8AHwAfAB8AHAAcA"},{"a":0.72727,"d":0.50284,"p":"XneLeExlrpMgMZpKNV6AETN0WREZTC0P","b":"f/9//////////3//f/8A/wD/APwD8APwA/AD8AfAB8AHwAfAB8AHwAfAB8ADAAMA"}],[{"a":0.68182,"d":0.7,"p":"V+HdTbOerp154+ZswZacu8Whob1Nx8dJ","b":"D/Af+D/8f/5//n5+fn5+fn/+f/w/+D/8f/5+/vx+/D/8P/w///5//n/+P/wf+Afg"},{"a":0.68182,"d":0.69394,"p":"V+LfTrOhrqF54uZswJWcvMWhor5NycpJ","b":"D/Af+D/8f/5//n5+fn5+fn/+P/wf+D/8f/5+/vx+/D/8P/w///5//n/+P/wf+Afg"},{"a":0.63636,"d":0.72403,"p":"ceXiZsulq7qX5umM45ug3emipOFgys1c","b":"D/A//H/8f/7//v5+/D7+fn/+f/4//D/8f/7+f/w//D/8P/w//////3/+f/wf+Afg"},{"a":0.63636,"d":0.72403,"p":"cePhZM2iq7qY5OmN45ug3emhpOJgyctb","b":"D/A//H/8f/7//v5+/D7+fn/+f/4//D/8f/7+f/w//D/8P/w//////3/+f/wf+Afg"},{"a":0.71429,"d":0.85714,"p":"YXRjNHqSfUiBnIZMeIqCUWV7fFNOZWZG","b":"//j/+P/4//j/+P/4//j/+P/4//j/+P/4//j///////////////////////j/+P/4"},{"a":0.80952,"d":0.84874,"p":"WG5zRW+Gill9kYlTh4pyTHp/eWBSY2hX","b":"P/g/+D/4//////////8//z//P/////////////8//z//P///////////D/gP+A/4"},{"a":0.80952,"d":0.82353,"p":"WG5zRW+Gill9kYlTh4pyTHp/eWBSY2hX","b":"P/g/+D/4//////////8//z//P//////4//j///8//z//P///////////D/gP+A/4"},{"a":0.71429,"d":0.85714,"p":"Z3lkNYKZgEWLpo5QgYuDVnmJgV5gc2tF","b":"//j/+P/4//j/+P/4//j/+P/4//j/+P/4//j///////////////////////j/+P/4"},{"a":0.7619,"d":0.92857,"p":"RU9bWG55h4p1jZiQeo2Di3uGgYJaam5d","b":"P/w//D/8////////////////////////////////////////////////P/w//D/8"},{"a":0.7619,"d":0.85714,"p":"LldaQ0Z7fl9TjYpXV36FVmGCgmVScmtN","b":"P/w//D/8//////////8//D/8P/w//D/8P/z/////////////////////P/w//D/8"},{"a":0.7619,"d":0.83929,"p":"LldaQ0Z7fl9TjYpXV36FVmGCgmVScmtN","b":"P/w//D/8P/8//z//P/8//D/8P/w//D/8P/z/////////////////////P/w//D/8"},{"a":0.7619,"d":0.89286,"p":"PVpYOWJzdF9kg4tzYICJfWl0fX1aXWJV","b":"P/w//D/8//z//P/8//z//////////z//P///////////////////////P/w//D/8"},{"a":0.66667,"d":0.85156,"p":"QUxPQmeAhIB6lJuMgJGIlm18cn4zREc7","b":"B/wH/Af8////////P/8//z//////////////////////////////////B+AH4Afg"},{"a":0.66667,"d":0.76563,"p":"M0ZFMmJ3dWFZfoZzanmFgF1tc2YuRUo2","b":"B+AH4AfgP/w//D/8////////P/8//z//////////////////P/w//D/8B+AH4Afg"},{"a":0.7619,"d":0.875,"p":"MkxSS09/h4NTjJ2OT4SWh2OKhYFheHdq","b":"P/w//D/8P/8//z//P/8//z//P/8//z//P/8//z//P/8///////////////z//P/8"},{"a":0.7619,"d":0.84821,"p":"MkxSS09/h4NTjJ2OT4SWh2OKhYFheHdq","b":"B/wH/Af8P/8//z//P/8//z//P/8//z//P/8//z//P/8///////////////z//P/8"},{"a":0.625,"d":0.85,"p":"SFJOK29/d0J8jYFIgIp9VnN2bVw8QkM6","b":"H/gf+B/4//////////////////j/+P/4////////////////////////H8AfwB/A"},{"a":0.71429,"d":0.88571,"p":"SFJOK2p5cj97jYFIf46ATYGCdl1tcmpZ","b":"H/gf+B/4//j/+P/4//j////////////4//j/////////////////////////////"},{"a":0.70833,"d":0.75,"p":"RVtSLXiNhE90m45TiZaGYHuCdWI4Sk86","b":"D/gP+A/4P/g/+D/4////////P/g/+D/4////////////////P/g/+D/4D+AP4A/g"},{"a":0.66667,"d":0.77344,"p":"LkRLOU9jbWNMeYZ1aH2IfmBramoyPz0y","b":"B/wH/Af8P/w//D/8P/8//z//P/8//z//////////////////P/w//D/8B+AH4Afg"},{"a":0.7619,"d":0.83036,"p":"LkRLOUleZ11RdYJyV36Me216fHxZZWRh","b":"B/wH/Af8P/w//D/8P/w//z//P/8//z//P///////////////////////P/w//D/8"},{"a":0.64,"d":0.75,"p":"KTpBL05sd19Yg4xyZ4KEe3duaHtGVllL","b":"B+AH4AfgB+A//D/8P/8//z//P/8//z//P/8//z//////H/8f////////B/wH/Af8"},{"a":0.64,"d":0.72,"p":"KTpBL05sd19Yg4xyZ4KEe3duaHtGVllL","b":"AOAA4ADgAOA//D/8P/8//z//P/8//z//P/8//z//////H/8f////////B/wH/Af8"},{"a":0.65217,"d":0.76522,"p":"VIlwOn+PhGiCqJRdkH+Fi5CChoxMcl0z","b":"B8B/+H/4//7//v/+//7//v/+//5/+H/4/////////H/8f/x//H///v/+f/gHwAfA"},{"a":0.69565,"d":0.74185,"p":"MH2HU1aflZBTraCQcpN8mWuPfY8oaXRL","b":"A+AP/g/+P/4//j5/Pn8//z//P/8//j/+/////////h/+f/5//n8//j/+D/4B4AHg"},{"a":0.68182,"d":0.77879,"p":"RYaEOHuLi1xzpKZeg46XdY97enZgjJJX","b":"H+Af4H/+f/7//v/+////f///f/5/+H/4f/5//v9+/37+fvx+//7//n/+f/4f+B/4"},{"a":0.68182,"d":0.8303,"p":"T5OYVWqHkG9no65td3aQinVugoVEf4BN","b":"P/w//D//P/////////////////8//D/8//////x//H/8f/x//////z//P/8P8A/w"},{"a":0.69565,"d":0.76902,"p":"OX+DPWyWkm1joqZ4YoSKh3F5go88bXpI","b":"AwAf/B/8f/9///////////////8f/B/8f/9//3//fD98P3w/fD//////n/wH8Afw"},{"a":0.65217,"d":0.75362,"p":"SYOAPX2TjWSCoJxki4R+bpiEendQeHE6","b":"AcB/+H/4f/5//v9+/37/fv9+//5//n/+//7//v/+/H7+f/9//3///v/+f/gH4Afg"},{"a":0.68182,"d":0.77879,"p":"WYNvN36PimF4pZtXhI2PlIxyfpJee3I8","b":"H+Af4H/4f/j//v/+//7/fv/+//5/+H/4//7//vx//H/8f/x////////+//4f+B/4"}],[{"a":0.68182,"d":0.68182,"p":"YOPMMNmJtaLcc6HHUsbdwoSPv5lW0LIl","b":"D+Af8D/4f/z//vz+/H78fvx+/H78f3//f/8//h/+H/5/fnx+f/5//H/8P/gf8AfA"},{"a":0.68182,"d":0.68182,"p":"YOTMMNiLtKTcdKHHUsnewoaSv5hW07Mk","b":"D+Af8D/4f/z//vz+/H78fvx+/H78f3//f/8//h/+H/5/fnx+f/5//H/8P/gf8AfA"},{"a":0.63636,"d":0.72403,"p":"e+jUS/OCtsf5b6LsZs3Y6aGUvrlu1bYx","b":"D+A/+H/8//7//v7++H/4P/g//D/8f/7/f/9//z//H/9/f/x///7//n/4f/g/8A+A"},{"a":0.68182,"d":0.68182,"p":"YOPMMNmJtaPcc6HHUsbdwoSPv5lW0LIl","b":"D+Af8D/4f/z//vz+/H78fvx+/H78f3//f/8//h/+H/5/fnx+f/5//H/8P/gf8AfA"},{"a":0.63636,"d":0.73052,"p":"e+bUS/SAt8L5bqLrZsrY6p+Rv7pu07Ux","b":"D+A/+H/8//7//v7++H/4P/g//D/8f///f/9//z//H///f/x///7//n/4f/g/8A+A"},{"a":0.68182,"d":0.68182,"p":"YOPMMNmItaPccqHGUsbdwoSPv5lW0LIl","b":"D+Af8D/4f/z//vz+/H78fvx+/H78f3//f/8//h/+H/5/fnx+f/5//H/8P/gf8AfA"},{"a":0.64,"d":0.75,"p":"NV1dPVB9f2xZiY6ET3+Qe1VyfGdQXlc/","b":"B+AH4AfgB+A//D/8//////////////////8//z//P/8//z////z//P/8B+AH4Afg"},{"a":0.64,"d":0.735,"p":"NV1dPVB9f2xZiY6ET3+Qe1VyfGdQXlc/","b":"B+AH4AfgB+A//D/8P/8//z////////////8//z//P/8//z////z//P/8B+AH4Afg"},{"a":0.64,"d":0.765,"p":"LEBGLVJhb2pxeoCgcIKXsGh5j5BBXmlQ","b":"AOAA4ADgAOA//D/8////////////////////////////////////////B+AH4Afg"},{"a":0.64,"d":0.7125,"p":"J0E/MDtdbVVLY45oWYScamGAiVdTbF01","b":"BwAHAAcABwA//z///////////////P/8//w//D/8P/w//D/8//z//P/8P+A/4D/g"},{"a":0.64,"d":0.6975,"p":"J0E/MDtdbVVLY45oWYScamGAiVdTbF01","b":"BwAHAAcABwA//z//P/8//z///////P/8//w//D/8P/w//D/8//z//P/8P+A/4D/g"},{"a":0.7619,"d":0.90179,"p":"SlNTSX9+eIOChYOoc3yZq3GFlpledXxm","b":"P/w//D/8////////////H/8f/x//////////////////////////////P/w//D/8"},{"a":0.68,"d":0.73412,"p":"MUBAKGB7f1Bth5Nfa4eVaXGAiWdFVlQ+","b":"D+AP4A/gD+A/+D/4//////////////////8//z//////////P/g/+D/4D+AP4A/g"},{"a":0.64,"d":0.735,"p":"KDI3LFdlb19dcouCRHGRiEBmfm0qQkw3","b":"B+AH4AfgB+A//D/8//////////////////8//z//P/8//z//P/w//D/8B+AH4Afg"},{"a":0.64,"d":0.705,"p":"KDI3LFdlb19dcouCRHGRiEBmfm0qQkw3","b":"AOAA4ADgAOA//D/8//////////////////8//z//P/8//z//P/w//D/8B+AH4Afg"},{"a":0.80952,"d":0.80672,"p":"XHd7TG2JkV1qhpZkcIeVbWp6fl8+T0s3","b":"P/g/+D/4/////////////////////z//P////////////z/4P/g/+D/4D+AP4A/g"},{"a":0.7619,"d":0.80357,"p":"VGJqWWJxhn1Kc5KKQHCOhT1ec14lPEQw","b":"P/w//D/8/////////////////////z//P/8//z//P/8//z/8P/w//D/8B+AH4Afg"},{"a":0.66667,"d":0.78125,"p":"PWFfNWpxc2hyanWOXWmDj1NtfGc0XF4z","b":"B+AH4Afg//z//P/8////////////////P/8//z//////////P/w//D/8B+AH4Afg"},{"a":0.64,"d":0.7425,"p":"JEdFKEZwcVBdf4RwXIeTaFd+iFZSY2dA","b":"BwAHAAcABwA//D/8//////////////////8//z//P/8//z////z//P/8P+A/4D/g"},{"a":0.66667,"d":0.75,"p":"NERKP2Jwc4plf5SpSH6cnkNsf3MhPEQw","b":"B+AH4AfgP/8//z//////////P/8//z//P/8//z//P/8//z//P/w//D/8B+AH4Afg"},{"a":0.66667,"d":0.72656,"p":"NERKP2Jwc4plf5SpSH6cnkNsf3MhPEQw","b":"B+AH4AfgP/8//z//////////P/8//z//P/8//z//P/8//z//P/w//D/8AOAA4ADg"},{"a":0.69565,"d":0.76087,"p":"PHmIQ5KIgo+Ig3q1MYOiv0l4kpc6Zm88","b":"A8Af/B/8f/9///////////w//D///3//f/8f/x//B/9//3z/fP//////n/wDwAPA"},{"a":0.65217,"d":0.75652,"p":"UId9OYyKkXSOhJWLZ5esgm2FkWdNbl4x","b":"B8B/+H/4//7//v////////x+/H7//v/+//5//n/+H/7//v9+/37//v/+f/gHwAfA"},{"a":0.69565,"d":0.74728,"p":"KnyEPXGRlYx6gYmvNoiorEiCk5E0bWk8","b":"AYAP+A/4P/4//v////////5//n///z//P/8//z//D/8//z5/Pn///v/+P/gD4APg"},{"a":0.66667,"d":0.72656,"p":"LHd6No+QlYaDc3C/M3uSt01/jYonWVgq","b":"B/AH8B/8H/z//////P/8//w/fD98P3//f/8f/x//Bz8HP3///////5/8n/wDAAMA"}]];

const clamp01 = (value) => Math.max(0, Math.min(1, value));

function finitePanelBox(panel) {
  const source = panel?.bbox && typeof panel.bbox === "object" ? panel.bbox : panel;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const width = Number(source?.width);
  const height = Number(source?.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function validImage(data, width, height) {
  return data && typeof data.length === "number"
    && Number.isInteger(width) && width > 0
    && Number.isInteger(height) && height > 0
    && data.length >= width * height * 4;
}

function sampleNearest(data, imageWidth, imageHeight, x, y, channel) {
  const sourceX = Math.max(0, Math.min(imageWidth - 1, Math.round(x)));
  const sourceY = Math.max(0, Math.min(imageHeight - 1, Math.round(y)));
  return data[(sourceY * imageWidth + sourceX) * 4 + channel];
}

function isYellow(r, g, b, threshold) {
  return r > 75 && g > 70 && b < 170
    && Math.min(r, g) - b > threshold
    && r + g > 190;
}

function createReferenceMask(data, imageWidth, imageHeight, bbox, threshold) {
  const mask = new Uint8Array(REFERENCE_PANEL_WIDTH * REFERENCE_PANEL_HEIGHT);
  const strength = new Uint8Array(mask.length);
  for (let y = VALUE_REGION.y0; y < VALUE_REGION.y1; y += 1) {
    const sourceY = bbox.y + (y + 0.5) * bbox.height / REFERENCE_PANEL_HEIGHT - 0.5;
    for (let x = VALUE_REGION.x0; x < VALUE_REGION.x1; x += 1) {
      const sourceX = bbox.x + (x + 0.5) * bbox.width / REFERENCE_PANEL_WIDTH - 0.5;
      const r = sampleNearest(data, imageWidth, imageHeight, sourceX, sourceY, 0);
      const g = sampleNearest(data, imageWidth, imageHeight, sourceX, sourceY, 1);
      const b = sampleNearest(data, imageWidth, imageHeight, sourceX, sourceY, 2);
      strength[y * REFERENCE_PANEL_WIDTH + x] = Math.max(0, Math.min(255, Math.min(r, g) - b));
      if (isYellow(r, g, b, threshold)) {
        mask[y * REFERENCE_PANEL_WIDTH + x] = 1;
      }
    }
  }
  return { mask, strength };
}

function normalizeComponent(component, strength) {
  const width = component.maxX - component.minX + 1;
  const height = component.maxY - component.minY + 1;
  const points = new Set(component.points.map(([x, y]) => `${x},${y}`));
  const bits = new Uint8Array(NORMALIZED_DIGIT_PIXELS);
  for (let y = 0; y < NORMALIZED_DIGIT_HEIGHT; y += 1) {
    const sourceY = component.minY + (y + 0.5) * height / NORMALIZED_DIGIT_HEIGHT - 0.5;
    for (let x = 0; x < NORMALIZED_DIGIT_WIDTH; x += 1) {
      const sourceX = component.minX + (x + 0.5) * width / NORMALIZED_DIGIT_WIDTH - 0.5;
      let hits = 0;
      for (let offsetY = 0; offsetY < 2; offsetY += 1) {
        for (let offsetX = 0; offsetX < 2; offsetX += 1) {
          const sampleX = Math.max(component.minX, Math.min(
            component.maxX,
            Math.round(sourceX + (offsetX - 0.5) * width / NORMALIZED_DIGIT_WIDTH * 0.5)
          ));
          const sampleY = Math.max(component.minY, Math.min(
            component.maxY,
            Math.round(sourceY + (offsetY - 0.5) * height / NORMALIZED_DIGIT_HEIGHT * 0.5)
          ));
          if (points.has(`${sampleX},${sampleY}`)) hits += 1;
        }
      }
      bits[y * NORMALIZED_DIGIT_WIDTH + x] = hits >= 2 ? 1 : 0;
    }
  }
  const profile = new Uint8Array(24);
  for (let gridY = 0; gridY < 6; gridY += 1) {
    const top = component.minY + gridY * height / 6;
    const bottom = component.minY + (gridY + 1) * height / 6;
    for (let gridX = 0; gridX < 4; gridX += 1) {
      const left = component.minX + gridX * width / 4;
      const right = component.minX + (gridX + 1) * width / 4;
      let sum = 0;
      let count = 0;
      for (let sampleY = Math.floor(top); sampleY < Math.ceil(bottom); sampleY += 1) {
        for (let sampleX = Math.floor(left); sampleX < Math.ceil(right); sampleX += 1) {
          if (sampleX < component.minX || sampleX > component.maxX
            || sampleY < component.minY || sampleY > component.maxY) continue;
          sum += strength[sampleY * REFERENCE_PANEL_WIDTH + sampleX];
          count += 1;
        }
      }
      profile[gridY * 4 + gridX] = count ? Math.round(sum / count) : 0;
    }
  }
  return {
    bits,
    aspect: width / height,
    density: component.points.length / (width * height),
    profile,
    width,
    height,
  };
}

function extractDigitGlyph(mask, cellIndex, strength) {
  const bounds = DIGIT_CELLS[cellIndex];
  if (!bounds) return null;
  const [left, right] = bounds;
  const visited = new Uint8Array(mask.length);
  let best = null;
  for (let y = 278; y < 316; y += 1) {
    for (let x = left; x < right; x += 1) {
      const start = y * REFERENCE_PANEL_WIDTH + x;
      if (!mask[start] || visited[start]) continue;
      const queue = [start];
      const points = [];
      let minX = REFERENCE_PANEL_WIDTH;
      let maxX = -1;
      let minY = REFERENCE_PANEL_HEIGHT;
      let maxY = -1;
      visited[start] = 1;
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const point = queue[cursor];
        const pointY = Math.floor(point / REFERENCE_PANEL_WIDTH);
        const pointX = point - pointY * REFERENCE_PANEL_WIDTH;
        points.push([pointX, pointY]);
        minX = Math.min(minX, pointX);
        maxX = Math.max(maxX, pointX);
        minY = Math.min(minY, pointY);
        maxY = Math.max(maxY, pointY);
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const nextY = pointY + offsetY;
          if (nextY < 276 || nextY >= 316) continue;
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const nextX = pointX + offsetX;
            if (nextX < left || nextX >= right) continue;
            const next = nextY * REFERENCE_PANEL_WIDTH + nextX;
            if (mask[next] && !visited[next]) {
              visited[next] = 1;
              queue.push(next);
            }
          }
        }
      }
      const componentHeight = maxY - minY + 1;
      // カンマや「玉」からのJPEGにじみは高さが小さいので数字に含めない。
      if (componentHeight < 12) continue;
      if (!best || points.length > best.points.length) {
        best = { points, minX, maxX, minY, maxY };
      }
    }
  }
  return best ? normalizeComponent(best, strength) : null;
}

function decodePackedBits(value) {
  if (typeof globalThis.atob !== "function") throw new Error("Base64 decoder is unavailable");
  const packed = globalThis.atob(value);
  const bits = new Uint8Array(NORMALIZED_DIGIT_PIXELS);
  for (let index = 0; index < bits.length; index += 1) {
    bits[index] = (packed.charCodeAt(index >> 3) >> (7 - (index & 7))) & 1;
  }
  return bits;
}

function decodePackedBytes(value, expectedLength) {
  if (typeof globalThis.atob !== "function") throw new Error("Base64 decoder is unavailable");
  const packed = globalThis.atob(value);
  if (packed.length !== expectedLength) throw new Error("Packed OCR feature length is invalid");
  return Uint8Array.from(packed, (character) => character.charCodeAt(0));
}

const DIGIT_TEMPLATES = PACKED_DIGIT_TEMPLATES.map((templates) => templates.flatMap((template) => {
  try {
    return [{
      aspect: template.a,
      density: template.d,
      profile: template.p ? decodePackedBytes(template.p, 24) : new Uint8Array(24),
      bits: decodePackedBits(template.b),
    }];
  } catch {
    return [];
  }
}));

function glyphDistance(left, right) {
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.bits.length; index += 1) {
    if (left.bits[index] || right.bits[index]) union += 1;
    if (left.bits[index] && right.bits[index]) intersection += 1;
  }
  const shapeDistance = 1 - intersection / Math.max(1, union);
  let profileDistance = 0;
  for (let index = 0; index < left.profile.length; index += 1) {
    profileDistance += Math.abs(left.profile[index] - right.profile[index]) / 255;
  }
  profileDistance /= left.profile.length;
  return shapeDistance
    + Math.abs(left.aspect - right.aspect) * 0.12
    + Math.abs(left.density - right.density) * 0.45
    + profileDistance * 0.8;
}

function recognizeDigit(glyph) {
  const ranked = DIGIT_TEMPLATES.map((templates, digit) => ({
    digit,
    score: templates.length
      ? Math.min(...templates.map((template) => glyphDistance(glyph, template)))
      : Number.POSITIVE_INFINITY,
  })).sort((left, right) => left.score - right.score || left.digit - right.digit);
  return ranked.slice(0, 3);
}

function combineDigitCandidates(perDigit) {
  let beam = [{ text: "", score: 0 }];
  for (const candidates of perDigit) {
    const expanded = [];
    for (const current of beam) {
      for (const candidate of candidates.slice(0, 2)) {
        expanded.push({
          text: `${current.text}${candidate.digit}`,
          score: current.score + candidate.score,
        });
      }
    }
    beam = expanded.sort((left, right) => left.score - right.score || left.text.localeCompare(right.text)).slice(0, 8);
  }
  return beam.map((candidate) => ({
    ...candidate,
    score: candidate.score / Math.max(1, perDigit.length),
    value: Number(candidate.text),
  }));
}

function recognizeAtThreshold(data, imageWidth, imageHeight, bbox, threshold) {
  const { mask, strength } = createReferenceMask(data, imageWidth, imageHeight, bbox, threshold);
  const glyphs = DIGIT_CELLS.map((_, index) => extractDigitGlyph(mask, index, strength));
  const firstDigit = glyphs.findIndex(Boolean);
  if (firstDigit < 0) return { value: null, candidates: [], reason: "max-payout-not-found" };
  if (glyphs.slice(firstDigit).some((glyph) => !glyph)) {
    return { value: null, candidates: [], reason: "max-payout-digit-gap" };
  }
  const digitCandidates = glyphs.slice(firstDigit).map(recognizeDigit);
  if (digitCandidates.some((candidates) => !Number.isFinite(candidates[0]?.score))) {
    return { value: null, candidates: [], reason: "max-payout-template-unavailable" };
  }
  const candidates = combineDigitCandidates(digitCandidates);
  return {
    value: Number.isFinite(candidates[0]?.value) ? candidates[0].value : null,
    candidates,
    bestScore: candidates[0]?.score ?? Number.POSITIVE_INFINITY,
    margin: (candidates[1]?.score ?? 1) - (candidates[0]?.score ?? 1),
    reason: "",
  };
}

function sourceValueBbox(bbox) {
  return {
    x: bbox.x + VALUE_REGION.x0 / REFERENCE_PANEL_WIDTH * bbox.width,
    y: bbox.y + VALUE_REGION.y0 / REFERENCE_PANEL_HEIGHT * bbox.height,
    width: (VALUE_REGION.x1 - VALUE_REGION.x0) / REFERENCE_PANEL_WIDTH * bbox.width,
    height: (VALUE_REGION.y1 - VALUE_REGION.y0) / REFERENCE_PANEL_HEIGHT * bbox.height,
  };
}

function rejectedResult(reason, bbox = null) {
  return {
    value: null,
    accepted: false,
    confidence: 0,
    candidates: [],
    reasons: [reason],
    bbox,
  };
}

export function recognizeGraphPanelMaxPayout(data, imageWidth, imageHeight, panel) {
  if (!validImage(data, imageWidth, imageHeight)) return rejectedResult("invalid-image-data");
  const bbox = finitePanelBox(panel);
  if (!bbox) return rejectedResult("invalid-panel-bbox");
  if (bbox.width < 70 || bbox.height < 60
    || bbox.x + bbox.width <= 0 || bbox.y + bbox.height <= 0
    || bbox.x >= imageWidth || bbox.y >= imageHeight) {
    return rejectedResult("unsupported-panel-geometry", sourceValueBbox(bbox));
  }

  const variants = YELLOW_THRESHOLDS.map((threshold) => (
    recognizeAtThreshold(data, imageWidth, imageHeight, bbox, threshold)
  ));
  const validVariants = variants.filter((variant) => Number.isFinite(variant.value));
  if (!validVariants.length) {
    return rejectedResult(
      variants.find((variant) => variant.reason)?.reason || "max-payout-not-found",
      sourceValueBbox(bbox)
    );
  }

  const byValue = new Map();
  for (const variant of validVariants) {
    for (const candidate of variant.candidates.slice(0, 3)) {
      if (!byValue.has(candidate.value)) byValue.set(candidate.value, []);
      byValue.get(candidate.value).push(candidate.score);
    }
  }
  const candidates = [...byValue.entries()].map(([value, scores]) => {
    const score = scores.reduce((sum, current) => sum + current, 0) / scores.length;
    return {
      value,
      score,
      confidence: clamp01(1 - score / GRAPH_MAX_PAYOUT_OCR_CONFIG.maximumScore),
    };
  }).sort((left, right) => left.score - right.score || left.value - right.value).slice(0, 5);

  const unanimous = validVariants.length === YELLOW_THRESHOLDS.length
    && validVariants.every((variant) => variant.value === validVariants[0].value);
  const bestScore = Math.max(...validVariants.map((variant) => variant.bestScore));
  const minimumMargin = Math.min(...validVariants.map((variant) => variant.margin));
  const reasons = [
    ...(!unanimous ? ["max-payout-threshold-disagreement"] : []),
    ...(bestScore > GRAPH_MAX_PAYOUT_OCR_CONFIG.maximumScore ? ["max-payout-low-confidence"] : []),
    ...(minimumMargin < GRAPH_MAX_PAYOUT_OCR_CONFIG.minimumMargin ? ["max-payout-ambiguous"] : []),
  ];
  const accepted = reasons.length === 0;
  const confidence = clamp01(
    (1 - bestScore / GRAPH_MAX_PAYOUT_OCR_CONFIG.maximumScore) * 0.75
    + Math.min(1, minimumMargin / 0.08) * 0.25
  );

  return {
    value: validVariants[0].value,
    accepted,
    confidence,
    candidates,
    reasons,
    bbox: sourceValueBbox(bbox),
  };
}

export function attachGraphPanelMetadata(data, imageWidth, imageHeight, slots) {
  return (Array.isArray(slots) ? slots : []).map((slot) => {
    const graphMaxPayout = recognizeGraphPanelMaxPayout(
      data,
      imageWidth,
      imageHeight,
      slot
    );
    return {
      ...slot,
      graphMaxPayout,
      maxPayout: graphMaxPayout.value,
      maxPayoutAccepted: graphMaxPayout.accepted,
    };
  });
}

function encodePackedBits(bits) {
  if (typeof globalThis.btoa !== "function") throw new Error("Base64 encoder is unavailable");
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index]) bytes[index >> 3] |= 1 << (7 - (index & 7));
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

function encodePackedBytes(bytes) {
  if (typeof globalThis.btoa !== "function") throw new Error("Base64 encoder is unavailable");
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary);
}

// 開発時に、正解値を明示した実画像から固定字体を採取する補助関数。
// OCR結果を正解として再学習する事故を防ぐため groundTruthValues は必須。
export function createGraphMaxPayoutDigitTemplateFixture(
  data,
  imageWidth,
  imageHeight,
  slots,
  groundTruthValues,
  { yellowThresholds = YELLOW_THRESHOLDS } = {}
) {
  if (!validImage(data, imageWidth, imageHeight)) throw new Error("画像データが不正です");
  if (!Array.isArray(slots) || !Array.isArray(groundTruthValues)
    || slots.length !== groundTruthValues.length) {
    throw new Error("全グラフ枠分の正しい最高出玉をgroundTruthValuesへ明示してください");
  }
  const labels = groundTruthValues.map((value) => String(value));
  if (labels.some((value) => !/^\d{1,5}$/u.test(value))) {
    throw new Error("最高出玉の正解値は1〜5桁の非負整数で指定してください");
  }
  const templates = Array.from({ length: 10 }, () => new Map());
  slots.forEach((slot, rowIndex) => {
    const bbox = finitePanelBox(slot);
    if (!bbox) throw new Error(`${rowIndex + 1}枠目のbboxが不正です`);
    const label = labels[rowIndex];
    const startCell = DIGIT_CELLS.length - label.length;
    for (const threshold of yellowThresholds) {
      const { mask, strength } = createReferenceMask(data, imageWidth, imageHeight, bbox, threshold);
      [...label].forEach((character, digitIndex) => {
        const glyph = extractDigitGlyph(mask, startCell + digitIndex, strength);
        if (!glyph) throw new Error(`${rowIndex + 1}枠目の数字${character}を抽出できませんでした`);
        const packed = {
          a: Number(glyph.aspect.toFixed(5)),
          d: Number(glyph.density.toFixed(5)),
          p: encodePackedBytes(glyph.profile),
          b: encodePackedBits(glyph.bits),
        };
        templates[Number(character)].set(
          `${packed.a}:${packed.d}:${packed.p}:${packed.b}`,
          packed
        );
      });
    }
  });
  return templates.map((byShape) => [...byShape.values()]);
}
