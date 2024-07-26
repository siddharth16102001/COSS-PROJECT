import React, { useRef, useState, useEffect } from 'react';
import './App.css';

const intersects = (point, bounds) => {
  return point.x >= bounds.left && point.x <= bounds.right &&
         point.y >= bounds.top && point.y <= bounds.bottom;
};

const isPointInPolygon = (point, polygon) => {
  let x = point.x, y = point.y;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    let xi = polygon[i].x, yi = polygon[i].y;
    let xj = polygon[j].x, yj = polygon[j].y;

    let intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

class QuadTree {
  constructor(bounds, maxItems = 1, depth = 8) {
    this.bounds = bounds;
    this.maxItems = maxItems;
    this.depth = depth;
    this.points = [];
    this.children = [];
  }

  insert(point) {
    if (!intersects(point, this.bounds)) {
      return false;
    }

    if (this.points.length < this.maxItems && this.depth > 0) {
      this.points.push(point);
      return true;
    } else {
      if (this.children.length === 0) {
        this.subdivide();
      }

      return this.children.some(child => child.insert(point));
    }
  }

  subdivide() {
    if (this.children.length > 0 || this.depth === 0) {
      return;
    }

    const { left, top, right, bottom } = this.bounds;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;

    this.children.push(new QuadTree({ left, top, right: midX, bottom: midY }, this.maxItems, this.depth - 1));
    this.children.push(new QuadTree({ left: midX, top, right, bottom: midY }, this.maxItems, this.depth - 1));
    this.children.push(new QuadTree({ left, top: midY, right: midX, bottom }, this.maxItems, this.depth - 1));
    this.children.push(new QuadTree({ left: midX, top: midY, right, bottom }, this.maxItems, this.depth - 1));
  }

  queryRange(range, found = []) {
    if (!intersects(range, this.bounds)) {
      return found;
    }

    for (let point of this.points) {
      if (intersects(point, range)) {
        found.push(point);
      }
    }

    for (let child of this.children) {
      child.queryRange(range, found);
    }

    return found;
  }

  getCenter() {
    const { left, top, right, bottom } = this.bounds;
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }

  draw(ctx) {
    if (this.children.length > 0) {
      this.children.forEach(child => child.draw(ctx));
    } else {
      const { left, top, right, bottom } = this.bounds;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.strokeRect(left, top, right - left, bottom - top);

      const center = this.getCenter();
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(center.x, center.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  findCommonPoints(otherQuadTree, commonPoints = []) {
    if (!intersects(this.bounds, otherQuadTree.bounds)) {
      return commonPoints;
    }

    for (let point of this.points) {
      if (otherQuadTree.queryRange({ left: point.x, top: point.y, right: point.x, bottom: point.y }).length > 0) {
        commonPoints.push(point);
      }
    }

    for (let child of this.children) {
      child.findCommonPoints(otherQuadTree, commonPoints);
    }

    return commonPoints;
  }
}


const App = () => {
  const [userPolygons, setUserPolygons] = useState([]);
  const [adminPolygons, setAdminPolygons] = useState([]);
  const [image, setImage] = useState(null);
  const canvasRef = useRef(null);
  const [currentPolygon, setCurrentPolygon] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [uploadStage, setUploadStage] = useState('admin');
  const [selectedColor, setSelectedColor] = useState('#FF0000');
  const [userSelectedColor, setUserSelectedColor] = useState('#0000FF');
  const [selectedPolygon, setSelectedPolygon] = useState(null);

  const quadTreeBounds = { left: 0, top: 0, right: 600, bottom: 400 };
  const adminQuadTree = useRef(new QuadTree(quadTreeBounds)).current;
  const userQuadTree = useRef(new QuadTree(quadTreeBounds)).current;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      setImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCanvasClick = (e) => {
    if (!isDrawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setCurrentPolygon([...currentPolygon, { x, y }]);
  };

  const interpolatePoints = (start, end) => {
    const points = [];
    const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    const steps = Math.ceil(distance / 5);
    const stepX = (end.x - start.x) / steps;
    const stepY = (end.y - start.y) / steps;

    for (let i = 0; i <= steps; i++) {
      points.push({ x: start.x + stepX * i, y: start.y + stepY * i });
    }
    return points;
  };

  useEffect(() => {
    const drawPolygons = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const drawPolygonWithLabel = (polygon, label) => {
        if (polygon.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(polygon.points[0].x, polygon.points[0].y);
          polygon.points.forEach(point => {
            ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.strokeStyle = polygon.color;
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = polygon.color;
          ctx.font = '12px Arial';
          ctx.fillText(label, polygon.points[0].x, polygon.points[0].y - 5);

          polygon.points.forEach(point => {
            ctx.fillRect(point.x - 1, point.y - 1, 2, 2);
          });

          if (polygon === selectedPolygon) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
            polygon.quadTree.draw(ctx);
          }
        }
      };

      const drawCommonPoints = (commonPoints) => {
        if (!commonPoints.length) return;
        ctx.fillStyle = '#FFA500';
        commonPoints.forEach(point => {
          ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
        });
      };

      adminPolygons.forEach(polygon => {
        drawPolygonWithLabel(polygon, 'admin');
      });

      userPolygons.forEach(polygon => {
        drawPolygonWithLabel(polygon, 'user');
      });

      if (currentPolygon.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentPolygon[0].x, currentPolygon[0].y);
        currentPolygon.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });
        ctx.strokeStyle = uploadStage === 'admin' ? selectedColor : userSelectedColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const commonPoints = adminQuadTree.findCommonPoints(userQuadTree);
      drawCommonPoints(commonPoints);
    };

    drawPolygons();
  }, [currentPolygon, userPolygons, adminPolygons, selectedColor, userSelectedColor, selectedPolygon]);

  const handleStartPolygon = () => {
    setIsDrawing(true);
    setCurrentPolygon([]);
  };

  const handleEndPolygon = () => {
    setIsDrawing(false);

    if (currentPolygon.length < 3) return;

    const allPoints = [];
    for (let i = 0; i < currentPolygon.length - 1; i++) {
      allPoints.push(...interpolatePoints(currentPolygon[i], currentPolygon[i + 1]));
    }
    allPoints.push(...interpolatePoints(currentPolygon[currentPolygon.length - 1], currentPolygon[0]));

    const newPolygon = {
      points: allPoints,
      color: uploadStage === 'admin' ? selectedColor : userSelectedColor,
      type: uploadStage,
      quadTree: new QuadTree({ left: 0, top: 0, right: 600, bottom: 400 })
    };

    if (uploadStage === 'admin') {
      setAdminPolygons([...adminPolygons, newPolygon]);
      allPoints.forEach(point => newPolygon.quadTree.insert(point));
      allPoints.forEach(point => adminQuadTree.insert(point));
    } else {
      setUserPolygons([...userPolygons, newPolygon]);
      allPoints.forEach(point => newPolygon.quadTree.insert(point));
      allPoints.forEach(point => userQuadTree.insert(point));
    }
    setCurrentPolygon([]);
  };

  const handleUpload = (role) => {
    const canvas = canvasRef.current;
    const imageData = canvas.toDataURL('image/png');

    console.log(`Image uploaded by ${role}:`, imageData);

    if (role === 'admin') {
      localStorage.setItem('adminPolygons', JSON.stringify(adminPolygons));
      setUploadStage('user');
    } else if (role === 'user') {
      localStorage.setItem('userPolygons', JSON.stringify(userPolygons));
    }

    setCurrentPolygon([]);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handlePolygonClick = (polygon) => {
    setSelectedPolygon(polygon);
  };

  return (
    <div className="container">
      <h1>Image Annotation Tool</h1>
      <input type="file" accept="image/*" onChange={handleImageUpload} />
      <div className="image-container">
        {image && (
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={{ backgroundImage: `url(${image})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }}
            onClick={handleCanvasClick}
          />
        )}
      </div>
      <div className="button-container">
        <button className="control-button" onClick={handleStartPolygon}>Start Polygon</button>
        <button className="control-button" onClick={handleEndPolygon}>End Polygon</button>
      </div>
      <div className="button-container">
        {uploadStage === 'admin' ? (
          <>
            <label htmlFor="admin-color">Admin Color:</label>
            <select id="admin-color" value={selectedColor} onChange={(e) => setSelectedColor(e.target.value)} className="color-select">
              <option value="#FF0000">Red</option>
              <option value="#00FF00">Green</option>
              <option value="#0000FF">Blue</option>
              <option value="#FFFF00">Yellow</option>
              <option value="#FF00FF">Magenta</option>
            </select>
            <button className="upload-button" onClick={() => handleUpload('admin')}>Upload as Admin</button>
          </>
        ) : (
          <>
            <label htmlFor="user-color">User Color:</label>
            <select id="user-color" value={userSelectedColor} onChange={(e) => setUserSelectedColor(e.target.value)} className="color-select">
              <option value="#FF0000">Red</option>
              <option value="#00FF00">Green</option>
              <option value="#0000FF">Blue</option>
              <option value="#FFFF00">Yellow</option>
              <option value="#FF00FF">Magenta</option>
            </select>
            <button className="upload-button" onClick={() => handleUpload('user')}>Upload as User</button>
          </>
        )}
      </div>
      <div className="list-view">
        <h3>Polygons</h3>
        <ul>
          {adminPolygons.map((polygon, index) => (
            <li key={index} className="list-item" onClick={() => handlePolygonClick(polygon)}>
              Admin Polygon {index + 1}
            </li>
          ))}
          {userPolygons.map((polygon, index) => (
            <li key={index} className="list-item" onClick={() => handlePolygonClick(polygon)}>
              User Polygon {index + 1}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
export default App;
