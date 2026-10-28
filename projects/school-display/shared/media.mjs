export const defaultPhotos=['/icon.svg','/images/student-break.png','/images/student-return.png'];
export const validPhotoPath=value=>typeof value==='string'&&(defaultPhotos.includes(value)||/^\/api\/images\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value));
export function imageRefs(settings,rows=[],specialDays=[]){
 const paths=['breakImage','returnImage','logoImage','lessonStartImage','lessonFinishImage','eventImage'].map(key=>settings[key]);
 for(const row of [...rows,...specialDays.flatMap(day=>day.schedule||[])])paths.push(row.teacherImage,row.actionImage);
 return [...new Set(paths.filter(path=>path&&!defaultPhotos.includes(path)))];
}
